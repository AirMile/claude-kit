import type { Meters } from "./delegate-policy";
import { gptRefusal, runCost, shareRefusal } from "./gpt-limits";

// Shared plan meters, without a dependency on flow or delegate: whether GPT can take a review
// now, and both plans' last figures for flow's log.
export type MeterState = { meters: Meters; observedAt: number; ok: boolean };
type Balance = { enabled: boolean; claude: MeterState; gpt: MeterState };

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

// The last meters seen, for flow's decision log.
export const balanceMeters = (): { claude: Meters; gpt: Meters } => ({
  claude: current.claude.meters,
  gpt: current.gpt.meters,
});

// Whether ChatGPT has room to share a build of this size, for the task note on Claude Pro.
export const sharing = (now: number, role: "build" | "build+"): boolean =>
  balance(now).ready &&
  !shareRefusal(
    current.gpt.meters,
    current.claude.meters,
    now,
    runCost(role, role === "build" ? "terra" : "sol"),
  );

export function balance(now: number): { ready: boolean } {
  const { enabled, gpt } = current;
  return {
    ready:
      enabled &&
      gpt.ok &&
      now - gpt.observedAt < FRESH_MS &&
      hasPct(gpt.meters, "five_hour") &&
      hasPct(gpt.meters, "seven_day") &&
      !gptRefusal(gpt.meters, now, runCost("review", "sol")),
  };
}
