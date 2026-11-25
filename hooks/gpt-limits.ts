import type { Family, Meters, Role } from "./delegate-policy";

// Whether a GPT run fits ChatGPT's two windows. Pure: routing (delegate-policy.ts), readiness
// (balance.ts), a council (task-policy.ts) and /gpt ask it.

// ChatGPT Plus is small, so a run kit starts itself must fit what is left of both windows.
export const GPT_FULL = 95;
// Points of the 5h window an Astra run needs free; a council (Sol and Astra) is that much too.
export const ASTRA_COST = 18;

// Points of the 5h window one run needs free, from runs measured on Plus: a Sol read took 2 to
// 5, a large Sol build 8 to 25, Astra 9 to 13 reading and 24 writing.
export function runCost(role: Role, family: Family): number {
  if (family === "astra") return role === "build" || role === "build+" ? 25 : ASTRA_COST;
  return role === "build+" ? 20 : 5;
}

function wait(ms: number): string {
  const min = Math.round(ms / 60_000);
  const h = Math.floor(min / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${min % 60}m`;
}

// On Claude Pro both plans are small, so GPT also takes searching, research and building: while
// a run fits under this share of each window (the rest is kept for reviews) and ChatGPT's week is
// at most `lead` points further ahead of the time gone by than Claude's.
export const SHARE = { five_hour: 70, seven_day: 75, lead: 10 } as const;

const WEEK = 168 * 3_600_000;
// How far a week's use runs ahead of the time gone by in it, in points; 0 without a reset ahead.
function ahead(w: Meters["seven_day"], now: number): number {
  const left = w?.resetsAt ? Date.parse(w.resetsAt) - now : 0;
  return w && left > 0 ? w.pct - (1 - Math.min(1, left / WEEK)) * 100 : 0;
}

// Why GPT doesn't take work that Claude could do too, or undefined.
export function shareRefusal(
  gpt: Meters,
  claude: Meters,
  now: number,
  cost: number,
): string | undefined {
  if (!gpt.five_hour && !gpt.seven_day)
    return "ChatGPT's limits could not be read";
  for (const [w, name, add, most] of [
    [gpt.five_hour, "5h window", cost, SHARE.five_hour],
    [gpt.seven_day, "week", 0, SHARE.seven_day],
  ] as const) {
    if (!w || (w.resetsAt && Date.parse(w.resetsAt) <= now)) continue;
    if (w.pct + add > most)
      return `ChatGPT's ${name} is at ${w.pct}%, the rest is kept for reviews`;
  }
  return ahead(gpt.seven_day, now) - ahead(claude.seven_day, now) > SHARE.lead
    ? "ChatGPT's week is further used than Claude's"
    : undefined;
}

// Why a run needing `cost` points of the 5h window does not fit ChatGPT's meters, or undefined.
// A window past its reset counts as empty; one not reported does not refuse.
export function gptRefusal(
  m: Meters,
  now: number,
  cost: number,
): string | undefined {
  for (const [w, name, add] of [
    [m.five_hour, "5h window", cost],
    [m.seven_day, "week", 1],
  ] as const) {
    if (!w) continue;
    const left = w.resetsAt ? Date.parse(w.resetsAt) - now : undefined;
    if (left !== undefined && left <= 0) continue;
    if (w.pct + add <= GPT_FULL) continue;
    const reset = left ? ` (resets in ${wait(left)})` : "";
    return `ChatGPT's ${name} is at ${w.pct}%${reset}`;
  }
  return undefined;
}
