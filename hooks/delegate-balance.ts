import { hasPct, setBalance, type MeterState } from "./balance";
import type { Meters } from "./delegate-policy";

// Each provider updates independently; keep the other provider's last meters.
let claude: MeterState = { meters: {}, observedAt: 0, ok: false };
let gpt: MeterState = { meters: {}, observedAt: 0, ok: false };
let enabled = false;

function refresh() {
  setBalance({ enabled, claude, gpt });
}

export function noteClaudeMeters(next: Meters, now: number) {
  const ok = hasPct(next, "five_hour") || hasPct(next, "seven_day");
  claude = ok ? { meters: next, observedAt: now, ok } : { ...claude, ok };
  refresh();
}

export const claudeMeters = (): Meters => claude.meters;

export function noteClaudeLimits(
  limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
  now: number,
): Meters {
  const meters: Meters = {};
  for (const r of limits)
    if (r.kind === "five_hour" || r.kind === "seven_day")
      meters[r.kind] = { pct: r.percentUsed, resetsAt: r.resetsAt };
  noteClaudeMeters(meters, now);
  return meters;
}

export function noteGptMeters(
  on: boolean,
  next: Meters | undefined,
  now: number,
  observedAt = now,
) {
  enabled = on;
  const ok =
    next !== undefined &&
    hasPct(next, "five_hour") &&
    hasPct(next, "seven_day");
  gpt = ok ? { meters: next!, observedAt, ok } : { ...gpt, ok };
  refresh();
}
