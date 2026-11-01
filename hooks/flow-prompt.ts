import type { EngineInterface } from "claude-code";

import { balance } from "./balance";
import { EXPLORE_LABELS } from "./explore-first";
import { CHANGE_LABELS, changeOfLabel } from "./flow-policy";
import { isThin, type Kind } from "./model-policy";
import { VERIFY_LABELS, verifyOfLabel } from "./task-policy";

const CLASSIFY_CHARS = 4000;

// The prompt classifiers run together: what changes, what it needs verified, whether fresh
// reading is needed. A direct question skips the first two, /build the first; without GPT,
// the last.
export async function classifyPrompt(
  $: EngineInterface,
  text: string,
  kind: Kind,
  build: boolean,
  thin: boolean,
) {
  const input = text.slice(0, CLASSIFY_CHARS);
  const ready = balance(await $.clock.now()).ready;
  const ask = (labels: Record<string, string>, skip: boolean) =>
    skip
      ? undefined
      : $.model
          .classify(input, Object.values(labels), { model: "haiku" })
          .catch(() => undefined);
  const direct = thin || kind === "question";
  const [changeLabel, verifyLabel, exploreLabel] = await Promise.all([
    ask(CHANGE_LABELS, build || direct), // /build is heavy anyway
    ask(VERIFY_LABELS, direct), // a risky /build still needs V3
    ask(EXPLORE_LABELS, !ready || build || isThin(text)),
  ]);
  return {
    change: changeOfLabel(changeLabel),
    verify: verifyOfLabel(verifyLabel),
    explore: exploreLabel === EXPLORE_LABELS.explore,
    ready,
  };
}
