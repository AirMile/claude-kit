import type { Kind } from "./model-policy";

// Flow, pure: every change task gets a track (light, medium, heavy) from what the prompt asks
// and grows heavier as the work shows its size, never lighter. A track's note goes out once, at
// the start or on growth; the procedure itself stays in the build skill. Before a turn ends
// with changed code, flow wants evidence it saw itself: the worktree as it is now (git's
// fingerprint, which also sees shell, subagent and GPT edits) must be the one a passing check
// ran on, and heavy work with a spec also needs the kit:verifier's PASS on it. Without git it
// falls back to the order of the edits and checks it saw. It holds a turn at most once per
// round of changes and twice per task, so it can never loop. flow.ts keeps the state.

export type Track = "light" | "medium" | "heavy";
export type Change = "none" | Track;

// What the change classifier sees: the risk of the change, not the model it needs.
export const CHANGE_LABELS: Record<Change, string> = {
  none: "none: no code change (an explanation, a question, a review, a plan only)",
  light: "light: a small local change in one or two files",
  medium:
    "medium: a bounded behaviour change or a clear bug across a few files",
  heavy:
    "heavy: a new capability (page, route, endpoint, model, migration), an interface " +
    "several modules use, or a change whose scope is unclear",
};

export function changeOfLabel(label: string | undefined): Change | undefined {
  return (Object.keys(CHANGE_LABELS) as Change[]).find(
    (c) => CHANGE_LABELS[c] === label,
  );
}

const RANK: Record<Track, number> = { light: 0, medium: 1, heavy: 2 };
export const TRACKS: readonly Track[] = ["light", "medium", "heavy"];

export type Task = {
  id: number;
  first: Track; // the track it started on: the log's test of the first pick
  track: Track;
  files: string[]; // code files this chat changed in the task (Edit, Write, GPT)
  spec: boolean; // a spec under docs/specs/ was written: heavy then needs the verifier
  basePrint?: string; // the worktree when the task began; undefined: no git
  checkedPrint?: string; // the worktree a passing check started on
  verifiedPrint?: string; // the worktree the verifier said PASS on
  lastEditAt: number; // without git: when code last changed (0: not yet)
  lastCheckAt: number; // without git: when the last passing check started
  lastVerifierAt: number;
  checks: number;
  failed: number;
  verifier?: "pass" | "fail";
  blocks: number;
  blockedRound?: string; // the round of changes the last hold was for
  stopAsked: boolean; // the user said to skip verifying
  unverified: boolean; // let through without evidence
};

export const newTask = (
  id: number,
  track: Track,
  basePrint?: string,
): Task => ({
  id,
  first: track,
  track,
  files: [],
  spec: false,
  basePrint,
  lastEditAt: 0,
  lastCheckAt: 0,
  lastVerifierAt: 0,
  checks: 0,
  failed: 0,
  blocks: 0,
  stopAsked: false,
  unverified: false,
});

const byPrint = (t: Task, print: string | undefined): print is string =>
  print !== undefined && t.basePrint !== undefined;

// Whether code changed since the task began: by git when it can tell, else by the edits seen.
export const changed = (t: Task, print: string | undefined): boolean =>
  byPrint(t, print) ? print !== t.basePrint : t.lastEditAt > 0;

const needsVerifier = (t: Task) => t.track === "heavy" && t.spec;

export function verified(t: Task, print: string | undefined): boolean {
  if (!changed(t, print)) return true;
  if (byPrint(t, print))
    return (
      t.checkedPrint === print &&
      (!needsVerifier(t) || t.verifiedPrint === print)
    );
  return (
    t.lastCheckAt > t.lastEditAt &&
    (!needsVerifier(t) || t.lastVerifierAt > t.lastEditAt)
  );
}

const NOTE: Record<Track, string> = {
  light:
    "kit flow (light): make the change, then run a check that covers it (the project's test, " +
    "typecheck or lint for those files).",
  medium:
    "kit flow (medium): before editing, state 2-4 acceptance criteria in the chat; test first " +
    "where it can be tested; then run the checks that cover the change (the full suite when " +
    "shared code changed). A self-contained piece you can describe up front: hand it to " +
    "mcp__kit__delegate (role build) and review its diff here.",
  heavy:
    "kit flow (heavy): follow the kit:build skill (its Feature or Fix path) up to and " +
    "including Verify: a spec, plan mode, the build, then the kit:verifier agent. Commit or " +
    "push nothing (the spec commit included) unless the user asks.",
};
const RESEARCH =
  "kit flow: reading code or docs widely, or weighing options, can go to mcp__kit__delegate " +
  "(role research); keep the decision here.";

export const trackNote = (track: Track, from?: Track): string =>
  from
    ? `kit flow: this task grew from ${from} to ${track}. ${NOTE[track]}`
    : NOTE[track];

// Only an explicit ask turns the gate off for a task: "stop" or "no tests" alone are requests.
const SKIP =
  /\b(?:skip (?:the )?(?:verify|verification|checks?|tests?)|no verif\w*|don'?t (?:verify|test)|niet (?:verifi\w*|testen)|zonder (?:te )?(?:verifi\w*|testen)|geen verificatie)\b/i;

export type PromptStep = {
  task: Task | undefined;
  ended?: Task; // the task this prompt closed
  note?: string;
  event: "none" | "start" | "continue" | "escalate";
};

// A short reply, a question, or an answer to the question the last turn ended on keeps the open
// task; any other request closes it (verified or not) and starts afresh, so unchecked work never
// swallows the rest of the session.
export function onPrompt(i: {
  task: Task | undefined;
  kind: Kind;
  change: Change | undefined; // undefined: not classified
  build: boolean; // /build: always heavy, the skill leads
  thin: boolean;
  answering: boolean; // the last turn ended on a question to the user
  text: string;
  id: number; // for a new task
  print: string | undefined;
}): PromptStep {
  const skip = SKIP.test(i.text);
  const want: Change | undefined = i.build ? "heavy" : i.change;
  if (i.task && (i.thin || i.answering || i.kind === "question")) {
    const task = { ...i.task, stopAsked: i.task.stopAsked || skip };
    if (want && want !== "none" && RANK[want] > RANK[task.track]) {
      const from = task.track;
      task.track = want;
      return { task, event: "escalate", note: trackNote(want, from) };
    }
    return { task, event: "continue" };
  }
  const ended = i.task;
  if (!want || want === "none")
    return {
      task: undefined,
      ended,
      event: "none",
      note: i.kind === "planning" && want === "none" ? RESEARCH : undefined,
    };
  const task = { ...newTask(i.id, want, i.print), stopAsked: skip };
  return { task, ended, event: "start", note: NOTE[want] };
}

const DOCS = /(^|\/)docs?\/|\.(md|txt)$/i;
const RISKY = /migrat|(^|\/)schema|\.sql$/i;
const SPEC = /(^|\/)docs\/specs\/[^/]+\.md$/;
export const isSource = (path: string): boolean =>
  !DOCS.test(path.replace(/\\/g, "/"));

export type Escalation = { task: Task; started: boolean; note?: string };

// A file this chat wrote or edited. Code changed outside any task starts a light one (based on
// the worktree before the prompt): flow always applies. A spec marks the task as a Feature.
export function onEdit(
  task: Task | undefined,
  path: string,
  now: number,
  id: number,
  basePrint: string | undefined,
): Escalation | undefined {
  const p = path.replace(/\\/g, "/");
  if (SPEC.test(p))
    return task ? { task: { ...task, spec: true }, started: false } : undefined;
  if (!isSource(p)) return task ? { task, started: false } : undefined;
  const t = task ? { ...task } : newTask(id, "light", basePrint);
  if (!t.files.includes(p)) t.files = [...t.files, p];
  t.lastEditAt = now;
  const want: Track =
    t.files.length > 8 || RISKY.test(p)
      ? "heavy"
      : t.files.length > 3
        ? "medium"
        : "light";
  if (RANK[want] > RANK[t.track]) {
    const from = t.track;
    t.track = want;
    return { task: t, started: !task, note: trackNote(want, from) };
  }
  return { task: t, started: !task };
}

// A check ran. A pass is evidence for the worktree it started on; a failure wipes earlier
// evidence (a later lint pass must not stand in for failing tests).
export function onCheck(
  task: Task,
  passed: boolean,
  startedAt: number,
  startPrint: string | undefined,
): Task {
  return passed
    ? {
        ...task,
        checks: task.checks + 1,
        lastCheckAt: startedAt,
        checkedPrint: startPrint,
      }
    : {
        ...task,
        failed: task.failed + 1,
        lastCheckAt: 0,
        checkedPrint: undefined,
      };
}

// The verifier's answer: PASS when its suite passed and no criterion failed or stayed unclear.
export const verifierPassed = (answer: string): boolean =>
  /^suite:\s*pass\b/im.test(answer) &&
  !/^-\s*\[(?:fail|unclear)\]/im.test(answer);

export function onVerifier(
  task: Task,
  passed: boolean,
  now: number,
  print: string | undefined,
): Task {
  return passed
    ? { ...task, verifier: "pass", lastVerifierAt: now, verifiedPrint: print }
    : {
        ...task,
        verifier: "fail",
        lastVerifierAt: 0,
        verifiedPrint: undefined,
      };
}

export type Outcome =
  | "none"
  | "done"
  | "block"
  | "pass-question"
  | "pass-asked"
  | "pass-unverified";
export type Verdict = {
  task: Task | undefined; // undefined: the task is done
  ended?: Task;
  block?: string; // why the turn should go on
  outcome: Outcome;
};

const short = (files: string[]) =>
  !files.length
    ? "Code"
    : files.length > 3
      ? `${files.slice(0, 3).join(", ")} and ${files.length - 3} more`
      : files.join(", ");

// The turn wants to end. Verified work closes the task; otherwise hold once per round of
// changes and twice per task, never when the turn ends on a question to the user.
export function stopVerdict(
  task: Task | undefined,
  lastMessage: string | undefined,
  print: string | undefined,
): Verdict {
  if (!task || !changed(task, print)) return { task, outcome: "none" };
  if (verified(task, print))
    return { task: undefined, ended: task, outcome: "done" };
  if ((lastMessage ?? "").trim().endsWith("?"))
    return { task, outcome: "pass-question" };
  if (task.stopAsked)
    return { task: { ...task, unverified: true }, outcome: "pass-asked" };
  const round = byPrint(task, print) ? print : String(task.lastEditAt);
  if (task.blocks >= 2 || task.blockedRound === round)
    return { task: { ...task, unverified: true }, outcome: "pass-unverified" };
  const checked = byPrint(task, print)
    ? task.checkedPrint === print
    : task.lastCheckAt > task.lastEditAt;
  const block = !checked
    ? `kit flow: ${short(task.files)} changed after the last passing check. Run the check ` +
      "that covers the change (test, typecheck or lint, without a pipe that hides its exit " +
      "code) and fix what fails. This project has no such check → say so and stop."
    : task.verifier === "fail"
      ? "kit flow: the kit:verifier reported failures on this heavy task: fix them, then run " +
        "it again."
      : "kit flow: the checks pass, but this heavy task's spec has no verification yet: run " +
        "the kit:verifier agent on it before you finish.";
  return {
    task: { ...task, blocks: task.blocks + 1, blockedRound: round },
    block,
    outcome: "block",
  };
}
