import { band, gptTight, lean, type Band, type Meters } from "./delegate-policy";

// Shared delegation state, without a dependency on flow or delegate.
export type MeterState = { meters: Meters; observedAt: number; ok: boolean };
type Balance = { enabled: boolean; claude: MeterState; gpt: MeterState };

let currentBand: Band = "balanced";

const FRESH_MS = 15 * 60_000;
let current: Balance = {
  enabled: false,
  claude: { meters: {}, observedAt: 0, ok: false },
  gpt: { meters: {}, observedAt: 0, ok: false },
};

export function hasPct(meters: Meters, kind: keyof Meters): boolean {
  return Number.isFinite(meters[kind]?.pct);
}

export function setBalance(next: Balance) {
  current = next;
}

export function balance(now: number): { ready: boolean; leaning: boolean; band: Band } {
  const { enabled, claude, gpt } = current;
  if (claude.ok && gpt.ok)
    currentBand = band(currentBand, lean(claude.meters, gpt.meters, now));
  return {
    ready:
      enabled &&
      gpt.ok &&
      now - gpt.observedAt < FRESH_MS &&
      hasPct(gpt.meters, "five_hour") &&
      hasPct(gpt.meters, "seven_day") &&
      !gptTight(gpt.meters),
    leaning: currentBand === "gpt-heavy",
    band: currentBand,
  };
}
