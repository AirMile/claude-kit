import { expect, test } from "claude-code/testing";
import {
  ASTRA_COST,
  VERIFY_LABELS,
  decide,
  decisionNote,
  escalate,
  isCouncil,
  levelsText,
  roomOf,
  sameLevels,
  verifyOfLabel,
  type VerifyNeed,
} from "./task-policy";

const ask = (over: Partial<Parameters<typeof decide>[0]> = {}) =>
  decide({
    kind: "routine",
    change: "light",
    verify: "behaviour",
    explore: false,
    council: false,
    room: { astra: true },
    ...over,
  });

test("classifies direct answers and bounded changes", () => {
  expect(ask({ kind: "question", change: "none" }).levels).toEqual({
    d: 0,
    e: 0,
    v: 0,
    r: 0,
  });
  expect(ask({ change: undefined }).levels).toEqual({ d: 0, e: 0, v: 0, r: 0 });
  expect(ask({ verify: "cosmetic" }).levels).toEqual({
    d: 1,
    e: 0,
    v: 1,
    r: 0,
  });
  expect(ask().levels).toEqual({ d: 1, e: 1, v: 1, r: 0 });
  expect(ask({ change: "medium", verify: "cosmetic" }).levels).toEqual({
    d: 1,
    e: 1,
    v: 1,
    r: 0,
  });
  expect(ask({ change: "medium", verify: "shared" }).levels.v).toBe(2);
  expect(ask({ verify: "risky" }).levels.v).toBe(3);
  expect(ask({ verify: undefined }).levels.v).toBe(1);
});

test("heavy, explore, planning and council set define", () => {
  expect(ask({ change: "heavy", verify: "cosmetic" }).levels).toEqual({
    d: 2,
    e: 2,
    v: 2,
    r: 0,
  });
  expect(ask({ explore: true }).levels.d).toBe(2);
  expect(
    ask({ kind: "question", change: "none", explore: true }).levels.d,
  ).toBe(2);
  expect(ask({ kind: "routine", change: "none", explore: true }).levels.d).toBe(
    0,
  );
  expect(ask({ kind: "planning", change: "none" }).levels.d).toBe(2);
  expect(ask({ council: true }).levels.d).toBe(3);
});

test("without room for Astra only a council is lowered, never execute or verification", () => {
  const limited = ask({
    council: true,
    verify: "risky",
    room: { astra: false },
  });
  expect(limited.levels).toEqual({ d: 2, e: 1, v: 3, r: 0 });
  expect(limited.reasons.join(" ")).toContain("D2");
  expect(limited.reasons.join(" ")).toContain("Astra");
  expect(decisionNote(limited)).toContain(limited.reasons[0]);
});

test("continuations keep E and V, but define and refactor are fresh", () => {
  const prev = { d: 3, e: 2, v: 3, r: 2 } as const;
  expect(ask({ change: "none", prev }).levels).toEqual({
    d: 0,
    e: 2,
    v: 3,
    r: 0,
  });
  expect(
    ask({ change: "heavy", prev: { d: 0, e: 1, v: 1, r: 0 } }).levels,
  ).toEqual({ d: 2, e: 2, v: 2, r: 0 });
  expect(ask({ prev, room: { astra: false } }).levels.v).toBe(3);
});

test("escalation raises E and V, caps them and respects budget", () => {
  const room = { astra: true };
  expect(escalate({ d: 1, e: 1, v: 1, r: 1 }, room).levels).toEqual({
    d: 1,
    e: 2,
    v: 2,
    r: 1,
  });
  expect(escalate({ d: 3, e: 3, v: 3, r: 2 }, room).levels).toEqual({
    d: 3,
    e: 3,
    v: 3,
    r: 2,
  });
  const tight = escalate(
    { d: 1, e: 0, v: 2, r: 0 },
    { astra: false },
  );
  expect(tight.levels).toEqual({ d: 1, e: 1, v: 3, r: 0 });
});

test("meter thresholds require room for Astra", () => {
  expect(ASTRA_COST).toBe(18);
  expect(roomOf(true, { five_hour: { pct: 77 } })).toEqual({ astra: true });
  expect(roomOf(true, { five_hour: { pct: 78 } })).toEqual({ astra: false });
  expect(roomOf(false, { five_hour: { pct: 0 } })).toEqual({ astra: false });
  expect(roomOf(true, {})).toEqual({ astra: false });
});

test("council asks are explicit", () => {
  for (const s of [
    "met z'n drieën",
    "met zn drieen",
    "met z'n vieren",
    "laat sol en astra meedenken",
    "laat Astra en Sol meedenken",
    "council",
    "Council please",
  ])
    expect(isCouncil(s)).toBe(true);
  for (const s of ["counsel", "drie bestanden", "sol fixes it"])
    expect(isCouncil(s)).toBe(false);
});

test("verify labels round trip", () => {
  for (const need of Object.keys(VERIFY_LABELS) as VerifyNeed[])
    expect(verifyOfLabel(VERIFY_LABELS[need])).toBe(need);
  expect(verifyOfLabel(undefined)).toBe(undefined);
  expect(verifyOfLabel("unknown")).toBe(undefined);
});

test("display levels, notes and equality", () => {
  expect(levelsText({ d: 1, e: 1, v: 1, r: 0 })).toBe("D1 E1 V1");
  expect(levelsText({ d: 2, e: 3, v: 3, r: 1 })).toBe("D2 E3 V3 R1");
  expect(levelsText({ d: 0, e: 0, v: 0, r: 2 })).toBe("D0 E0 V0 R2");
  expect(sameLevels(undefined, ask().levels)).toBe(false);
  expect(sameLevels(ask().levels, ask().levels)).toBe(true);
  expect(sameLevels({ d: 1, e: 1, v: 1, r: 1 }, ask().levels)).toBe(false);
  const note = decisionNote(ask());
  expect(note).toContain("kit task: D1 E1 V1");
  expect(note).toContain(
    "Make it here, with its covering check.",
  );
  expect(note).not.toContain("run_task");
  expect(decisionNote(ask({ change: "heavy" }))).toContain(
    "Make it here in steps, each with its covering check.",
  );
  expect(
    decisionNote(ask({ change: "heavy", prev: { d: 2, e: 3, v: 2, r: 0 } })),
  ).toContain("blind second plan from another model family");
});

test("with GPT sharing the work the note hands research and building to it", () => {
  const room = { astra: true, share: true, large: true };
  const note = decisionNote(ask({ room }));
  expect(note).toContain("mcp__kit__run_task (role build)");
  const heavy = decisionNote(ask({ room, change: "heavy" }));
  expect(heavy).toContain("mcp__kit__run_task (role build+)");
  expect(heavy).toContain("Have mcp__kit__delegate (role research)");
  expect(decisionNote(ask({ change: "heavy" }))).not.toContain("run_task");
  expect(roomOf(true, { five_hour: { pct: 0 } }, true)).toEqual({
    astra: true,
    share: true,
  });
});

test("without room for a large build E2 stays here while E1 still goes to GPT", () => {
  const room = { astra: true, share: true };
  expect(decisionNote(ask({ room }))).toContain("run_task (role build)");
  expect(decisionNote(ask({ room, change: "heavy" }))).toContain(
    "Make it here in steps",
  );
  expect(roomOf(true, { five_hour: { pct: 0 } }, true, true)).toEqual({
    astra: true,
    share: true,
    large: true,
  });
});
