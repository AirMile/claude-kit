import type { CommandSpec, EngineInterface } from "claude-code";

import { geminiCached, readGemini } from "./agy-usage";
import { agyStatus } from "./agy-run";
import { geminiRoute } from "./delegate-policy";
import { geminiOn, setGeminiOn } from "./gemini-switch";

export const geminiCommand: CommandSpec = {
  name: "gemini",
  description: "kit: Gemini on or off, its review model and plan meters",
  argumentHint: "[on | off]",
  immediate: true,
};

const TURNED = {
  on: "Gemini on: it takes its share of reviews and second plans (by whose plan is used less), one GPT cannot take and a review of GPT's code, so that code goes to Google.",
  off: "Gemini off: it runs only when you ask for it, and its ring is hidden (the band's table still shows its meters).",
};

export async function geminiCommandRun(
  $: EngineInterface,
  e: { args: string },
) {
  const verb = e.args.trim();
  if (verb === "on" || verb === "off") {
    const saved = await setGeminiOn($, verb === "on");
    $.ui.invalidate("ui.render");
    return {
      text: saved
        ? TURNED[verb]
        : `could not save the Gemini switch; it did not turn ${verb}.`,
    };
  }
  const on = await geminiOn($);
  if (!on) return { text: "Gemini: off. /gemini on turns it on." };
  const st = await agyStatus($);
  if (!st.path)
    return {
      text: "Gemini: on, but agy (the Antigravity CLI) was not found.",
    };
  const r = geminiRoute("review", st.models);
  await readGemini($);
  const used = geminiCached();
  const pct = (k: "five_hour" | "seven_day") =>
    used?.[k] ? `${Math.round(used[k]!.pct)}%` : "?";
  return {
    text: [
      "Gemini: on",
      r.provider === "none"
        ? `review: ${r.reason}`
        : `review: ${r.name} (${r.model})`,
      `used: 5h ${pct("five_hour")} · weekly ${pct("seven_day")}`,
      "Gemini does: its share of reviews and second plans (whose plan is used less), one GPT cannot take, a review of GPT's code; anything else you ask it for",
    ].join("\n"),
  };
}
