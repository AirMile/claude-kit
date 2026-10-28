import { setBalance } from "./balance";
import { gptTight, lean, LEAN, type Meters } from "./delegate-policy";

// Each provider updates independently; keep the other provider's last meters.
let claude: Meters = {};
let gpt: Meters | undefined;
let enabled = false;

function refresh(now: number) {
  setBalance({
    ready: enabled && gpt !== undefined && !gptTight(gpt),
    leaning: lean(claude, gpt, now) >= LEAN,
  });
}

export function noteClaudeMeters(next: Meters, now: number) {
  claude = next;
  refresh(now);
}

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
) {
  enabled = on;
  gpt = next;
  refresh(now);
}
