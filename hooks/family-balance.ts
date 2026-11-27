import type { Meters } from "./delegate-policy";

// Which family takes an unasked review or second plan while GPT and Gemini are both on
// (family-turn.ts): the one whose plan is used less, by the week first and then the 5h window.
// Within CLOSE points of each other they take turns. GPT unless both plans' meters were read,
// so a missing reading never sends work to Gemini blind. Pure: meters in, a side out.

export type Side = "gpt" | "gemini";
export const CLOSE = 5;

export function balancePick(
  gpt: Meters | undefined,
  gemini: Meters | undefined,
  last?: Side,
): Side {
  if (!gpt || !gemini) return "gpt";
  let compared = false;
  for (const kind of ["seven_day", "five_hour"] as const) {
    const a = gpt[kind]?.pct;
    const b = gemini[kind]?.pct;
    if (a === undefined || b === undefined) continue;
    compared = true;
    if (Math.abs(a - b) >= CLOSE) return a < b ? "gpt" : "gemini";
  }
  if (!compared) return "gpt";
  return last === "gpt" ? "gemini" : "gpt";
}
