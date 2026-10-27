import { expect, test } from "claude-code/testing";

import {
  ALWAYS_FOR_MS,
  clockTime,
  holdOf,
  nextHold,
  overLimit,
  rise,
  shouldPing,
  stopAt,
  wantsPing,
  withHold,
} from "./limit-policy";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const IN_2H = "2026-10-16T14:00:00Z";

test("the pause point drops as the account burns faster", async () => {
  expect(stopAt([])).toBe(95);
  expect(stopAt([0.5])).toBe(95);
  expect(stopAt([0.5, 2])).toBe(92); // three rises of 2 points may land meanwhile
  expect(stopAt([20])).toBe(90); // never earlier than 90
});

test("only a running 5-hour window at the limit pauses", async () => {
  const at = (kind: string, pct: number, resetsAt = IN_2H) => ({
    kind,
    percentUsed: pct,
    resetsAt,
  });
  expect(overLimit([at("five_hour", 94)], 95, NOW)).toBe(null);
  expect(overLimit([at("five_hour", 96)], 95, NOW)).toEqual({
    until: Date.parse(IN_2H),
    percent: 96,
  });
  // A reading whose reset has passed is stale.
  expect(overLimit([at("five_hour", 99, "2026-10-16T11:00:00Z")], 95, NOW)).toBe(null);
  expect(overLimit([at("spend_limit", 99)], 95, NOW)).toBe(null);
  // The weekly window never pauses, even over the limit.
  const week = "2026-10-19T09:00:00Z";
  expect(overLimit([at("seven_day", 99, week)], 95, NOW)).toBe(null);
  expect(overLimit([at("five_hour", 97), at("seven_day", 99, week)], 95, NOW)?.until).toBe(
    Date.parse(IN_2H),
  );
});

test("a rise counts only within one window period", async () => {
  const r = (pct: number, resetsAt = IN_2H) => ({ kind: "five_hour", percentUsed: pct, resetsAt });
  expect(rise(undefined, r(10))).toBe(null);
  expect(rise(r(10), r(12.5))).toBe(2.5);
  expect(rise(r(10), r(10))).toBe(null);
  expect(rise(r(90, "2026-10-16T09:00:00Z"), r(2))).toBe(null); // reset between
});

test("keep-alives only while the reset is near and not imminent", async () => {
  const h = 60 * 60_000;
  expect(shouldPing(NOW + 2 * h, NOW)).toBe(true);
  expect(shouldPing(NOW + 6 * h, NOW)).toBe(false); // a cold start is cheaper
  expect(shouldPing(NOW + 5 * 60_000, NOW)).toBe(false); // resumes before it lapses
});

test("resume time reads as a clock time, with the day when not today", async () => {
  const at = new Date(NOW);
  at.setHours(14, 5, 0, 0);
  expect(clockTime(at.getTime(), at.getTime() - 60_000)).toBe("14:05");
  expect(clockTime(at.getTime() + 24 * 60 * 60_000, at.getTime())).toMatch(/^\w{3} 14:05$/);
});

test("the limit button cycles off, pause, warm; each chat keeps its own", async () => {
  expect(nextHold("off")).toBe("pause");
  expect(nextHold("pause")).toBe("warm");
  expect(nextHold("warm")).toBe("off");
  expect(holdOf(undefined, "s1")).toBe("pause"); // a new chat pauses
  expect(holdOf({ s1: "off", s2: "bogus" }, "s2")).toBe("pause");
  const kept = withHold({ s1: "off" }, "s2", "warm");
  expect(kept).toEqual({ s1: "off", s2: "warm" });
  const many = Object.fromEntries(
    Array.from({ length: 25 }, (_, i) => [`s${i}`, "off"]),
  );
  const trimmed = withHold(many, "new", "warm");
  expect(Object.keys(trimmed).length).toBe(20);
  expect(trimmed.new).toBe("warm");
});

test("Limit pings while work is open, Always for a day, Off never", async () => {
  const idle = {
    hold: "pause" as const,
    openWork: false,
    pauseUntil: null,
    pauseRefused: false,
    lastTurn: NOW - 60 * 60_000,
  };
  expect(wantsPing(idle, NOW)).toBe(false); // nothing open: let it cool
  expect(wantsPing({ ...idle, openWork: true }, NOW)).toBe(true);
  expect(wantsPing({ ...idle, hold: "off", openWork: true }, NOW)).toBe(false);
  expect(wantsPing({ ...idle, hold: "warm" }, NOW)).toBe(true);
  const dayAgo = NOW - ALWAYS_FOR_MS - 1;
  expect(wantsPing({ ...idle, hold: "warm", lastTurn: dayAgo }, NOW)).toBe(false);
  // A pause decides by its reset alone.
  const paused = { ...idle, pauseUntil: Date.parse(IN_2H) };
  expect(wantsPing(paused, NOW)).toBe(true);
  expect(wantsPing({ ...paused, pauseRefused: true }, NOW)).toBe(false);
});
