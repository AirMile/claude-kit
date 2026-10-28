import type { EngineInterface } from "claude-code";

import { balance } from "./balance";
import { EXPLORE_LABELS, exploreNote } from "./explore-first";
import { CHANGE_LABELS, changeOfLabel } from "./flow-policy";
import { log } from "./flow-store";
import { isThin, type Kind } from "./model-policy";

const CLASSIFY_CHARS = 4000;

// Both prompt classifiers run together; a direct answer never needs an explore note.
export async function classifyPrompt(
  $: EngineInterface,
  text: string,
  kind: Kind,
  build: boolean,
  thin: boolean,
) {
  const input = text.slice(0, CLASSIFY_CHARS);
  const ready = balance().ready; // without GPT the explore note never goes out: skip asking
  const [changeLabel, label] = await Promise.all([
    build || thin || kind === "question"
      ? undefined
      : $.model
          .classify(input, Object.values(CHANGE_LABELS), { model: "haiku" })
          .catch(() => undefined),
    !ready || build || isThin(text)
      ? undefined
      : $.model
          .classify(input, Object.values(EXPLORE_LABELS), { model: "haiku" })
          .catch(() => undefined),
  ]);
  const change = changeOfLabel(changeLabel);
  const note = exploreNote({
    label,
    ready,
    build,
    thin: isThin(text),
    kind,
    change,
  });
  if (note)
    await log($, { event: "explore-note", text: text.trim().slice(0, 60) });
  return { change, note };
}
