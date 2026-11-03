import type { Kind } from "./model-policy";
import type { Level, Levels } from "./task-policy";
import {
  changed,
  holdText,
  isOpen,
  missing,
  reminderText,
  roundOf,
  verified,
  type ReviewRecord,
} from "./flow-evidence";

export {
  byPrint,
  changed,
  needsVerifier,
  verified,
  verifierPassed,
  onVerifier,
  onCheck,
  onReview,
  onNoReviewer,
} from "./flow-evidence";

// Flow, pure: change tasks get a track that only grows. Current checks, the spec's verifier
// and the gate level's other-family review supply the evidence (flow-evidence.ts). Unverified
// work stays open across prompts; new changes fold into it. Holds are bounded per round and
// request, and the user can waive them. flow.ts keeps the state and task-policy.ts the levels.

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
  levels?: Levels; // task-policy's decision for it, raised as it grows
  gateV?: Level; // the required Verify level, raised by growth, not failing checks
  gptWrote?: boolean; // GPT wrote source in this task
  claudeWrote?: boolean; // Claude wrote source in this task
  review?: ReviewRecord; // the latest review, tied to the code it started on
  noReviewer?: { round: string; reason: string }; // no review hold for this round
  remindedRound?: string; // the round whose open work reminder was sent
  requestFiles?: number; // files already in the task when this request folded in
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

const NOTE: Record<Track, string> = {
  light:
    "kit flow (light): a small local change. When it is in, run a check that covers it (the " +
    "project's test, typecheck or lint for those files).",
  medium:
    "kit flow (medium): before editing, state 2-4 acceptance criteria in the chat; test first " +
    "where it can be tested; then run the checks that cover the change (the full suite when " +
    "shared code changed).",
  heavy:
    "kit flow (heavy): follow the kit:build skill (its Feature or Fix path) up to and " +
    "including Verify: a spec you approve, the build, then the kit:verifier agent. Commit or " +
    "push nothing (the spec commit included) unless the user asks.",
};

export const trackNote = (track: Track, from?: Track): string =>
  from
    ? `kit flow: this task grew from ${from} to ${track}. ${NOTE[track]}`
    : NOTE[track];

// Only an explicit ask turns the gate off for a task: "stop" or "no tests" alone are requests.
const SKIP =
  /\b(?:skip (?:the )?(?:verify|verification|checks?|tests?|review)|no verif\w*|don'?t (?:verify|test)|niet (?:verifi\w*|testen)|zonder (?:te )?(?:verifi\w*|testen)|geen (?:verificatie|review)|zonder review|no review|sla (?:de )?(?:verificatie|verify|checks?|tests?|review) over)\b/i;

export type PromptStep = {
  task: Task | undefined;
  ended?: Task; // the task this prompt closed
  note?: string;
  event: "none" | "start" | "continue" | "escalate" | "fold";
};

// Unverified work stays open: a new change request folds into it; other requests remind once
// per round. Short replies and answers keep the task, with a reminder after an unverified end.
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
    const from = task.track;
    const grew = want && want !== "none" && RANK[want] > RANK[from];
    if (grew) task.track = want;
    return kept(
      task,
      grew ? "escalate" : "continue",
      i.print,
      grew ? trackNote(task.track, from) : undefined,
      isOpen(task, i.print) && task.unverified,
    );
  }
  const open = i.task && isOpen(i.task, i.print) && !skip;
  if (i.task && open) {
    if (!want || want === "none") return kept(i.task, "continue", i.print);
    const from = i.task.track;
    const grew = RANK[want] > RANK[from];
    const task = {
      ...i.task,
      track: grew ? want : from,
      blocks: 0,
      unverified: false,
      requestFiles: i.task.files.length,
    };
    return kept(
      task,
      grew ? "escalate" : "fold",
      i.print,
      grew ? trackNote(want, from) : undefined,
    );
  }
  const ended = i.task && skip ? { ...i.task, stopAsked: true } : i.task;
  if (!want || want === "none")
    return { task: undefined, ended, event: "none" };
  const task = { ...newTask(i.id, want, i.print), stopAsked: skip };
  return { task, ended, event: "start", note: NOTE[want] };
}

function kept(
  task: Task,
  event: PromptStep["event"],
  print: string | undefined,
  note?: string,
  remind = true,
): PromptStep {
  if (remind && task.remindedRound !== roundOf(task, print)) {
    note = [note, reminderText(task, print)].filter(Boolean).join(" ");
    task = { ...task, remindedRound: roundOf(task, print) };
  }
  return { task, event, note };
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
  gpt = false,
): Escalation | undefined {
  const p = path.replace(/\\/g, "/");
  if (SPEC.test(p))
    return task ? { task: { ...task, spec: true }, started: false } : undefined;
  if (!isSource(p)) return task ? { task, started: false } : undefined;
  const t = task ? { ...task } : newTask(id, "light", basePrint);
  if (!t.files.includes(p)) t.files = [...t.files, p];
  t.lastEditAt = now;
  if (gpt) t.gptWrote = true;
  else t.claudeWrote = true;
  const n = t.files.length - (t.requestFiles ?? 0);
  const want: Track =
    n > 8 || RISKY.test(p) ? "heavy" : n > 3 ? "medium" : "light";
  if (RANK[want] > RANK[t.track]) {
    const from = t.track;
    t.track = want;
    return { task: t, started: !task, note: trackNote(want, from) };
  }
  return { task: t, started: !task };
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

// The turn wants to end. Verified work closes the task; otherwise hold once per round of
// changes and twice per request, never when the turn ends on a question to the user.
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
  const round = roundOf(task, print);
  const review = task.noReviewer?.round !== round;
  const wants = missing(task, print).filter(
    (item) => review || !item.startsWith("a review:"),
  );
  if (task.blocks >= 2 || task.blockedRound === round || !wants.length)
    return { task: { ...task, unverified: true }, outcome: "pass-unverified" };
  const block = holdText(task, print, review);
  return {
    task: { ...task, blocks: task.blocks + 1, blockedRound: round },
    block,
    outcome: "block",
  };
}
