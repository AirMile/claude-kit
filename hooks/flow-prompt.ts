import type { EngineInterface } from "claude-code";

import { balance } from "./balance";
import { EXPLORE_LABELS } from "./explore-first";
import { CHANGE_LABELS, changeOfLabel } from "./flow-policy";
import { isThin, type Kind } from "./model-policy";
import { VERIFY_LABELS, verifyOfLabel } from "./task-policy";

const CLASSIFY_CHARS = 4000;

type Ask = {
  name: "change" | "verify" | "explore";
  what: string;
  labels: Record<string, string>;
};

const QUESTIONS: Record<Ask["name"], Omit<Ask, "name">> = {
  change: { what: "what the request changes", labels: CHANGE_LABELS },
  verify: { what: "what the change needs verified", labels: VERIFY_LABELS },
  explore: {
    what: "whether fresh reading is needed",
    labels: EXPLORE_LABELS,
  },
};

// One Haiku call answers every question this prompt needs, one `name: key` line each, instead
// of one classify call per question: the request text is billed once. A reply that is missing,
// cut short or off the keys leaves that question unanswered (undefined), as a failed call did.
export function labelPrompt(text: string, asks: readonly Ask["name"][]) {
  const parts = asks.map((name) => {
    const q = QUESTIONS[name];
    return `${name} (${q.what}), answer with one of:\n${Object.values(q.labels)
      .map((l) => `  ${l}`)
      .join("\n")}`;
  });
  return (
    "Classify the request. Answer with exactly one line per question, `name: key`, " +
    "where key is the word before the colon of the chosen option. Nothing else.\n\n" +
    `${parts.join("\n\n")}\n\nRequest:\n<<<\n${text}\n>>>`
  );
}

export function parseLabels(
  reply: string,
  asks: readonly Ask["name"][],
): Partial<Record<Ask["name"], string>> {
  const out: Partial<Record<Ask["name"], string>> = {};
  for (const name of asks) {
    const hit = new RegExp(`^\\s*${name}\\s*:\\s*([a-z]+)`, "im").exec(reply);
    const label = hit?.[1] ? QUESTIONS[name].labels[hit[1]] : undefined;
    if (label) out[name] = label;
  }
  return out;
}

// The prompt classifiers run together: what changes, what it needs verified, whether fresh
// reading is needed. A direct question skips the first two, /build the first; without GPT,
// the last. Only the questions asked go into the one call; none asked, no call.
export async function classifyPrompt(
  $: EngineInterface,
  text: string,
  kind: Kind,
  build: boolean,
  thin: boolean,
) {
  const input = text.slice(0, CLASSIFY_CHARS);
  const ready = balance(await $.clock.now()).ready;
  const direct = thin || kind === "question";
  const asks: Ask["name"][] = [];
  if (!(build || direct)) asks.push("change"); // /build is heavy anyway
  if (!direct) asks.push("verify"); // a risky /build still needs V3
  if (ready && !build && !isThin(text)) asks.push("explore");
  const reply = asks.length
    ? await $.model
        .complete({
          model: "haiku",
          prompt: labelPrompt(input, asks),
          effort: "low",
          maxTokens: 40,
          timeoutMs: 20_000,
        })
        .catch(() => undefined)
    : undefined;
  const got = reply?.isAnswered ? parseLabels(reply.text, asks) : {};
  return {
    change: changeOfLabel(got.change),
    verify: verifyOfLabel(got.verify),
    explore: got.explore === EXPLORE_LABELS.explore,
    ready,
  };
}
