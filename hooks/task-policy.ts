import type { Change } from "./flow-policy";
import type { Kind } from "./model-policy";
import { GPT_TIGHT, type Meters } from "./delegate-policy";

// Task routing, pure: every typed prompt gets a level per system (Define, Execute, Verify,
// Refactor) from the prompt classifiers' labels, the plans' room and an explicit ask, and one
// short note: the levels, who executes, the next action and the evidence. GPT is the default
// worker for bounded work; budget lowers Execute and parallelism (the reason goes in the
// note), never Verify. Within a task Execute and Verify only rise; Define is per prompt.
// flow.ts keeps the levels on the open task and logs each decision.
export type Level = 0 | 1 | 2 | 3;
export type Levels = { d: Level; e: Level; v: Level; r: 0 | 1 | 2 };
export type VerifyNeed = "cosmetic" | "behaviour" | "shared" | "risky";
export const VERIFY_LABELS: Record<VerifyNeed, string> = {
  cosmetic: "cosmetic: text, styling or layout only; behaviour stays the same",
  behaviour: "behaviour: changes what the code does in one place",
  shared: "shared: changes code or an interface that several modules use",
  risky:
    "risky: a migration, auth or permissions, payments, or anything that can lose data",
};
export function verifyOfLabel(
  label: string | undefined,
): VerifyNeed | undefined {
  return (Object.keys(VERIFY_LABELS) as VerifyNeed[]).find(
    (v) => VERIFY_LABELS[v] === label,
  );
}

// Points of GPT's 5h window one Astra run took in one measurement: a start, tuned from the log.
export const ASTRA_COST = 18;
export type Room = { gpt: boolean; astra: boolean };
export function roomOf(ready: boolean, gpt: Meters): Room {
  return {
    gpt: ready,
    astra:
      ready &&
      gpt.five_hour !== undefined &&
      gpt.five_hour.pct + ASTRA_COST < GPT_TIGHT.five_hour,
  };
}

export const isCouncil = (text: string): boolean =>
  /\bcouncil\b|\bmet\s+z['’]?n\s+(?:drie[eë]n|vieren)\b|\b(?:sol\s+en\s+astra|astra\s+en\s+sol)\s+meedenken\b/i.test(
    text,
  );

export type Decision = { levels: Levels; reasons: string[] };
const max = (a: Level, b: Level): Level => Math.max(a, b) as Level;
function budget(levels: Levels, room: Room): Decision {
  const l = { ...levels };
  const reasons: string[] = [];
  if (!room.gpt && l.e > 0) {
    l.e = 0;
    reasons.push("GPT has no room: E0");
  }
  if (l.d === 3 && !room.astra) {
    l.d = 2;
    reasons.push("no room for Astra: D2");
  }
  return { levels: l, reasons };
}

export function decide(i: {
  kind: Kind;
  change: Change | undefined;
  verify: VerifyNeed | undefined;
  explore: boolean;
  build: boolean;
  council: boolean;
  room: Room;
  prev?: Levels;
}): Decision {
  const want = i.build ? "heavy" : i.change;
  const change = want !== undefined && want !== "none";
  const d: Level = i.council
    ? 3
    : (i.explore && (i.kind === "question" || change)) ||
        i.kind === "planning" ||
        want === "heavy"
      ? 2
      : change
        ? 1
        : 0;
  let e: Level =
    !change || (want === "light" && i.verify === "cosmetic")
      ? 0
      : want === "heavy"
        ? 2
        : 1;
  let v: Level = !change
    ? 0
    : i.verify === "risky"
      ? 3
      : i.verify === "shared"
        ? 2
        : 1;
  if (want === "heavy") v = max(v, 2);
  if (i.prev) {
    e = max(e, i.prev.e);
    v = max(v, i.prev.v);
  }
  return budget({ d, e, v, r: 0 }, i.room);
}

// Flow growth or a failing check: Execute and Verify one up; Define stays as it was decided.
export const escalate = (l: Levels, room: Room): Decision =>
  budget(
    {
      ...l,
      e: Math.min(3, l.e + 1) as Level,
      v: Math.min(3, l.v + 1) as Level,
    },
    { ...room, astra: true },
  );

export const levelsText = (l: Levels): string =>
  `D${l.d} E${l.e} V${l.v}${l.r ? ` R${l.r}` : ""}`;
export const sameLevels = (a: Levels | undefined, b: Levels): boolean =>
  a !== undefined && a.d === b.d && a.e === b.e && a.v === b.v && a.r === b.r;

const DEFINE: Record<Level, string> = {
  0: "Answer directly.",
  1: "State goal, bounds and a testable outcome first.",
  2: "Have mcp__kit__delegate (role research) read code and weigh alternatives; decide here.",
  3: "Get blind mcp__kit__delegate proposals (role plan, family sol and family astra), neither seeing the other; critique both, then decide.",
};
const EXECUTE: Record<Level, string> = {
  0: "Make it here.",
  1: "Give one brief with its covering check to mcp__kit__run_task (role build); review its diff here.",
  2: "Use mcp__kit__run_task (role build+) for briefs one at a time, each with its covering check; review each diff here.",
  3: "Use parallel analysis briefs (research/search), with one writer per checkout.",
};
const VERIFY: Record<Level, string> = {
  0: "Check the answer against its sources.",
  1: "Run a covering test, typecheck or lint; visually check UI.",
  2: "Run a covering check and get an independent other-family review via mcp__kit__delegate (role review): the gate wants both on the final code.",
  3: "Run a covering check and get an adversarial other-family review via mcp__kit__delegate (role review) of failure paths and integration (its answer has a failure-paths line): the gate wants both on the final code.",
};
const REFACTOR = [
  "",
  "Simplify locally after it passes and re-check.",
  "Make a separate refactor design and change.",
];
export function decisionNote(d: Decision): string {
  return [
    `kit task: ${levelsText(d.levels)}.`,
    DEFINE[d.levels.d],
    EXECUTE[d.levels.e],
    VERIFY[d.levels.v],
    REFACTOR[d.levels.r],
    d.reasons.length ? `(${d.reasons.join("; ")})` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
