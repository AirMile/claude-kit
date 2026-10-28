import { expect, test } from "claude-code/testing";

import { balance } from "./balance";
import {
  claudeMeters,
  noteClaudeLimits,
  noteGptMeters,
} from "./delegate-balance";

const now = Date.parse("2026-10-27T12:00:00Z");
const resetsAt = new Date(now + 168 * 3600000).toISOString();
const meters = (pct: number) => ({
  five_hour: { pct: 10 },
  seven_day: { pct, resetsAt },
});

test("balance follows either provider's meters and the GPT switch", async () => {
  noteGptMeters(true, meters(20), now);
  noteClaudeLimits([{ kind: "seven_day", percentUsed: 29, resetsAt }], now);
  expect(balance(now)).toEqual({ ready: true, leaning: false, band: "balanced" });
  noteClaudeLimits([{ kind: "seven_day", percentUsed: 30, resetsAt }], now);
  expect(balance(now)).toEqual({ ready: true, leaning: true, band: "gpt-heavy" });
  noteGptMeters(true, meters(21), now);
  expect(balance(now).leaning).toBe(true);
  noteGptMeters(true, meters(26), now);
  expect(balance(now).leaning).toBe(false);
  noteGptMeters(false, {}, now);
  expect(balance(now).ready).toBe(false);
  noteGptMeters(true, undefined, now);
  expect(balance(now).ready).toBe(false);
  noteGptMeters(true, { five_hour: { pct: 80 } }, now);
  expect(balance(now).ready).toBe(false);
  noteGptMeters(true, { seven_day: { pct: 90 } }, now);
  expect(balance(now).ready).toBe(false);
});

test("a failed usage read keeps Claude's last good meters and the previous band", async () => {
  noteGptMeters(true, meters(20), now);
  noteClaudeLimits([{ kind: "seven_day", percentUsed: 40, resetsAt }], now);
  expect(balance(now).leaning).toBe(true);
  noteClaudeLimits([], now + 1);
  expect(claudeMeters()).toEqual({ seven_day: { pct: 40, resetsAt } });
  expect(balance(now + 1).leaning).toBe(true);
});

test("GPT readiness expires and missing percentages cannot make it ready", async () => {
  noteGptMeters(true, meters(20), now);
  expect(balance(now + 15 * 60_000 - 1).ready).toBe(true);
  expect(balance(now + 15 * 60_000).ready).toBe(false);
  noteGptMeters(true, { five_hour: {}, seven_day: {} } as never, now);
  expect(balance(now).ready).toBe(false);
  expect(balance(now).leaning).toBe(true);
  noteGptMeters(true, meters(20), now + 16 * 60_000, now);
  expect(balance(now + 16 * 60_000).ready).toBe(false);
});
