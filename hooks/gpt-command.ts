import type { CommandSpec, EngineInterface } from "claude-code";

import { FAMILIES, newest, type Family } from "./delegate-policy";
import { gptRefusal, runCost, shareRefusal } from "./gpt-limits";
import { balanceMeters } from "./balance";
import { getPlan } from "./plan";
import type { Plan } from "./model-policy";
import {
  codexHint,
  gptOn,
  gptStatus,
  pins,
  setGptOn,
  setPins,
  type GptStatus,
} from "./codex-run";
import { syncLine } from "./window-sync";

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
  sync: string,
  plan: Plan,
): string {
  const lines = FAMILIES.map((f) => {
    const m = models[f];
    return `${f}: ${m ? `${m.name} (${m.id})` : "none"}${pinned[f] ? " · pinned" : ""}`;
  });
  const pct = (k: "five_hour" | "seven_day") =>
    st.limits[k] ? `${Math.round(st.limits[k]!.pct)}%` : "?";
  const hint = codexHint(st);
  lines.push(
    hint
      ? `Codex: ${hint}`
      : st.error
      ? `Codex: ${st.error}`
      : `ChatGPT ${st.limits.plan ?? ""}: 5h ${pct("five_hour")} · weekly ${pct("seven_day")}`,
  );
  const readable = !hint && !st.error;
  const room = (why: string | undefined) =>
    readable ? ` · room: ${why ? `no, ${why}` : "yes"}` : "";
  lines.push(
    "GPT does: review and second plan (Sol; Astra for the riskiest review)" +
      room(gptRefusal(st.limits, now, runCost("review", "sol"))),
  );
  lines.push(
    plan === "pro"
      ? "Claude Pro: GPT also takes search, research and building" +
          room(
            shareRefusal(
              st.limits,
              balanceMeters().claude,
              now,
              runCost("build", "terra"),
            ),
          )
      : "Claude Max: Claude searches, researches and builds",
  );
  lines.push(sync);
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
          ? "kit: GPT on: reviews and second plans, on Claude Pro also research and building, when ChatGPT has room."
          : "kit: GPT off: no work goes to GPT unless you name a model.",
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
    return {
      text: statusText(
        st,
        newest(st.models, next),
        next,
        await $.clock.now(),
        await syncLine($),
        await getPlan($),
      ),
    };
  }
  const st = await gptStatus($, true);
  return {
    text: statusText(
      st,
      newest(st.models, pinned),
      pinned,
      await $.clock.now(),
      await syncLine($),
      await getPlan($),
    ),
  };
}
