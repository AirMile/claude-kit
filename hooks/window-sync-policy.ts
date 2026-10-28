import type { Window } from "./delegate-policy";

// When kit starts ChatGPT's 5h window together with Claude's (window-sync.ts). ChatGPT's window
// starts at the first request after the last one ended, so one tiny request at the start of a
// Claude window makes both reset together. Pure: readings in, a decision out.

const MIN = 60_000;
export const FIVE_HOURS = 300 * MIN;
export const NEW_FOR = 30 * MIN;
// While idle, ChatGPT's reset reads as "now + 5h" and moves with every read; a little under
// after rounding and the time the read took.
const MOVING = 2 * MIN;

// ChatGPT's 5h window is idle: 0% and no reset, a reset already past, or the moving value. A
// fixed future reset is a running window, even at a rounded 0%.
export function gptIdle(w: Window | undefined, readAt: number): boolean {
  if (!w || w.pct > 0) return false;
  if (!w.resetsAt) return true;
  const left = Date.parse(w.resetsAt) - readAt;
  return left <= 0 || left >= FIVE_HOURS - MOVING;
}

// The start of Claude's 5h window when it is in use, began at most 30 minutes ago and was not
// synced yet (`synced`: the start kept at the last ping); undefined otherwise.
export function newWindow(
  claude: Window | undefined,
  now: number,
  synced: number | undefined,
): number | undefined {
  if (!claude?.resetsAt || claude.pct <= 0) return undefined;
  const start = Date.parse(claude.resetsAt) - FIVE_HOURS;
  if (Number.isNaN(start) || now - start > NEW_FOR) return undefined;
  if (synced !== undefined && Math.abs(synced - start) < NEW_FOR)
    return undefined;
  return start;
}

export function shouldPing(input: {
  claude: Window | undefined;
  gpt: Window | undefined;
  gptReadAt: number;
  now: number;
  synced: number | undefined;
}): { ping: boolean; start?: number } {
  const start = newWindow(input.claude, input.now, input.synced);
  return start !== undefined && gptIdle(input.gpt, input.gptReadAt)
    ? { ping: true, start }
    : { ping: false };
}
