import { expect, test } from "claude-code/testing";

import { balance } from "./balance";
import { noteClaudeLimits, noteGptMeters } from "./delegate-balance";

test("balance follows either provider's meters and the GPT switch", async () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  const resetsAt = new Date(now + 168 * 3600000).toISOString();
  noteGptMeters(true, { seven_day: { pct: 20, resetsAt } }, now);
  noteClaudeLimits([{ kind: "seven_day", percentUsed: 29, resetsAt }], now);
  expect(balance()).toEqual({ ready: true, leaning: false });
  noteClaudeLimits([{ kind: "seven_day", percentUsed: 30, resetsAt }], now);
  expect(balance()).toEqual({ ready: true, leaning: true });
  noteGptMeters(true, { seven_day: { pct: 21, resetsAt } }, now);
  expect(balance().leaning).toBe(false);
  noteGptMeters(false, {}, now);
  expect(balance().ready).toBe(false);
  noteGptMeters(true, undefined, now);
  expect(balance().ready).toBe(false);
  noteGptMeters(true, { five_hour: { pct: 80 } }, now);
  expect(balance().ready).toBe(false);
  noteGptMeters(true, { seven_day: { pct: 90 } }, now);
  expect(balance().ready).toBe(false);
});
