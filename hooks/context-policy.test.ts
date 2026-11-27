import { expect, test } from "claude-code/testing";

import {
  ABSOLUTE,
  COOLDOWN_TURNS,
  LEDGER_CAP,
  addRow,
  boundaryOf,
  endsOnQuestion,
  isBusy,
  ledgerText,
  shouldCompact,
  threshold,
  type Row,
} from "./context-policy";

const base = {
  on: true,
  boundary: true,
  used: 170_000,
  window: 400_000,
  turn: 10,
  lastCompactTurn: undefined as number | undefined,
};

test("the threshold is half the window, capped at the absolute limit", () => {
  expect(threshold(200_000)).toBe(100_000);
  expect(threshold(1_000_000)).toBe(ABSOLUTE);
  expect(threshold(0)).toBe(ABSOLUTE); // an unknown window falls back to the absolute limit
});

test("compacts at a boundary at or above the threshold", () => {
  expect(shouldCompact(base).compact).toBe(true);
  expect(shouldCompact({ ...base, used: 160_000 }).compact).toBe(true);
  expect(shouldCompact({ ...base, used: 159_999 }).compact).toBe(false);
  expect(
    shouldCompact({ ...base, window: 200_000, used: 100_000 }).compact,
  ).toBe(true);
});

test("never when off, off a boundary or without a reading", () => {
  expect(shouldCompact({ ...base, on: false })).toEqual({
    compact: false,
    reason: "off",
  });
  expect(shouldCompact({ ...base, boundary: false }).reason).toBe(
    "no boundary",
  );
  expect(shouldCompact({ ...base, used: 0 }).reason).toBe("no reading");
});

test("waits the cooldown after the last compaction", () => {
  const last = base.turn - COOLDOWN_TURNS + 1;
  expect(shouldCompact({ ...base, lastCompactTurn: last }).reason).toBe(
    "cooldown",
  );
  expect(
    shouldCompact({ ...base, lastCompactTurn: base.turn - COOLDOWN_TURNS })
      .compact,
  ).toBe(true);
});

const row = (n: number): Row => ({
  at: n,
  trigger: "auto",
  kit: false,
  before: 100_000 + n * 1000,
  after: 10_000,
});

test("the ledger keeps the newest rows up to the cap", () => {
  let rows: Row[] = [];
  for (let i = 0; i < LEDGER_CAP + 5; i += 1) rows = addRow(rows, row(i));
  expect(rows.length).toBe(LEDGER_CAP);
  expect(rows[0]?.at).toBe(5);
  expect(rows.at(-1)?.at).toBe(LEDGER_CAP + 4);
});

test("ledger text lists the latest rows, newest first, or says none", () => {
  expect(ledgerText([])).toBe("no compactions recorded yet");
  const text = ledgerText([
    row(1),
    { ...row(2), kit: true, before: undefined },
  ]);
  expect(text.split("\n")[0]).toContain("kit");
  expect(text.split("\n")[0]).toContain("?");
  expect(text.split("\n")[1]).toContain("101k → 10k");
});

test("only a running-turn refusal counts as busy", () => {
  expect(isBusy(new Error("kit: Turn is running, try later"))).toBe(true);
  expect(isBusy(new Error("unknown command compact"))).toBe(false);
});

test("a question at the end counts past markdown, quotes and a short parenthetical", () => {
  for (const q of [
    "Zal ik het bouwen?",
    "**Zal ik het bouwen?**",
    "Akkoord? (ja/nee)",
    "Welke kies je?\n",
    "Bedoel je `foo`?\u201d",
    "Klaar. (Zal ik ook committen?)",
    "Zal ik het bouwen? \u{1F642}",
    "Akkoord? \u{1F44D}\u{1F3FB}",
    `${"x ".repeat(5000)}Zal ik?`,
  ])
    expect(endsOnQuestion(q)).toBe(true);
  for (const a of ["Klaar.", "Waarom? Omdat het moet.", "Done (zie foo.ts)", "", undefined])
    expect(endsOnQuestion(a)).toBe(false);
  const started = Date.now();
  expect(endsOnQuestion(`prefix${" ".repeat(40_000)}x`)).toBe(false);
  expect(Date.now() - started).toBeLessThan(200);
});

test("a turn that goes on is no boundary; a closed one is done; open work or a question waits", () => {
  expect(boundaryOf({ goesOn: true, closed: true, question: false })).toBe(null);
  expect(boundaryOf({ goesOn: false, closed: true, question: false })).toBe("done");
  expect(boundaryOf({ goesOn: false, closed: false, question: false })).toBe("waiting");
  expect(boundaryOf({ goesOn: false, closed: true, question: true })).toBe("waiting");
});
