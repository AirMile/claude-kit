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

test("GPT is ready while a review fits both windows and the switch is on", async () => {
  const at = (five: number, week: number) => ({
    five_hour: { pct: five },
    seven_day: { pct: week, resetsAt },
  });
  noteGptMeters(true, meters(20), now);
  expect(balance(now)).toEqual({ ready: true });
  noteGptMeters(true, at(90, 94), now);
  expect(balance(now).ready).toBe(true);
  noteGptMeters(true, at(91, 20), now);
  expect(balance(now).ready).toBe(false);
  noteGptMeters(true, at(10, 95), now);
  expect(balance(now).ready).toBe(false);
  noteGptMeters(false, meters(20), now);
  expect(balance(now).ready).toBe(false);
  noteGptMeters(true, undefined, now);
  expect(balance(now).ready).toBe(false);
  noteGptMeters(true, { five_hour: { pct: 10 } }, now);
  expect(balance(now).ready).toBe(false);
});

test("a failed usage read keeps Claude's last good meters", async () => {
  noteClaudeLimits([{ kind: "seven_day", percentUsed: 40, resetsAt }], now);
  noteClaudeLimits([], now + 1);
  expect(claudeMeters()).toEqual({ seven_day: { pct: 40, resetsAt } });
});

test("GPT readiness expires and missing percentages cannot make it ready", async () => {
  noteGptMeters(true, meters(20), now);
  expect(balance(now + 15 * 60_000 - 1).ready).toBe(true);
  expect(balance(now + 15 * 60_000).ready).toBe(false);
  noteGptMeters(true, { five_hour: {}, seven_day: {} } as never, now);
  expect(balance(now).ready).toBe(false);
  noteGptMeters(true, meters(20), now + 16 * 60_000, now);
  expect(balance(now + 16 * 60_000).ready).toBe(false);
});
