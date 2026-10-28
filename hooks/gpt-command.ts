import type { CommandSpec, EngineInterface } from "claude-code";

import { balance } from "./balance";
import { FAMILIES, newest, type Family } from "./delegate-policy";
import {
  gptOn,
  gptStatus,
  pins,
  setGptOn,
  setPins,
  type GptStatus,
} from "./codex-run";

export const gptCommand: CommandSpec = {
  name: "gpt",
  description:
    "kit: GPT on or off, its models and ChatGPT meters; pin a family to a model id or unpin it",
  argumentHint: "[on | off | pin <family> <id> | unpin <family>]",
  immediate: true,
};

function statusText(
  st: GptStatus,
  models: Partial<Record<Family, { id: string; name: string }>>,
  pinned: Partial<Record<Family, string>>,
  now: number,
): string {
  const lines = FAMILIES.map((f) => {
    const m = models[f];
    return `${f}: ${m ? `${m.name} (${m.id})` : "none"}${pinned[f] ? " · pinned" : ""}`;
  });
  const pct = (k: "five_hour" | "seven_day") =>
    st.limits[k] ? `${Math.round(st.limits[k]!.pct)}%` : "?";
  lines.push(
    st.error
      ? `Codex: ${st.error}`
      : `ChatGPT ${st.limits.plan ?? ""}: 5h ${pct("five_hour")} · weekly ${pct("seven_day")}`,
  );
  lines.push(`balance: ${balance(now).band}`);
  return lines.join("\n");
}

export async function gptCommandRun($: EngineInterface, e: { args: string }) {
  const [verb, family, id] = e.args.trim().split(/\s+/);
  if (verb === "on" || verb === "off") {
    await setGptOn($, verb === "on");
    $.ui.invalidate("ui.render");
    return {
      text:
        verb === "on"
          ? "kit: GPT on: delegated work may run on GPT when ChatGPT has room."
          : "kit: GPT off: delegated work stays on Claude; a GPT model runs only when you name it.",
    };
  }
  if (!(await gptOn($)))
    return { text: "kit: GPT is off. /gpt on turns it on." };
  const pinned = await pins($);
  if (
    (verb === "pin" || verb === "unpin") &&
    FAMILIES.includes(family as Family)
  ) {
    const next = { ...pinned };
    if (verb === "pin" && id) next[family as Family] = id;
    else delete next[family as Family];
    await setPins($, next);
    const st = await gptStatus($);
    return { text: statusText(st, newest(st.models, next), next, await $.clock.now()) };
  }
  const st = await gptStatus($, true);
  return { text: statusText(st, newest(st.models, pinned), pinned, await $.clock.now()) };
}
