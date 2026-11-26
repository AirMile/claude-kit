import {
  KIND_NAME,
  KIND_RUN,
  listedIn,
  noCheckAdvice,
  noCheckNote,
  otherSession,
} from "./flow-advice";
import type { CheckKind } from "./flow-check";
import type { Task } from "./flow-policy";
import { requiredMissing } from "./flow-required";

// Evidence, pure: checks and reviews belong to the code they started on, by git's fingerprint
// or, without git, the order of observed edits. A missing reviewer excuses a hold, not evidence.
export type Family = "gpt" | "claude" | "gemini";
export type ReviewRecord = {
  outcome: "pass" | "fail" | "no verdict" | "error";
  family: Family;
  depth: boolean;
  print?: string; // the worktree when the review started
  at: number; // when the review started
  error?: string;
};

export const REVIEW_MARK =
  "start the answer with a line `verdict: pass` or `verdict: fail`";

const unmark = (line: string) => line.replace(/^[\s*_`>#]+|[\s*_`#]+$/g, "");
export function parseReview(answer: string): {
  outcome: "pass" | "fail" | "no verdict";
  depth: boolean;
} {
  const lines = answer
    .split(/\r?\n/)
    .filter((line) => !/^\s*```(?:text)?\s*$/i.test(line))
    .map((line) =>
      unmark(unmark(line).replace(/^-\s+/, "")).replace(
        /^(verdict|failure-paths):[*_`]*\s*/i,
        "$1: ",
      ),
    );
  const depth = lines.some((line) => {
    const text = unmark(line.match(/^failure-paths:\s*(.*)$/i)?.[1] ?? "");
    const value = text.replace(/[.,;!?]+$/, "").trim();
    return !!value && !/^(none|n\/a|-|—|<[^<>]*>)$/i.test(value);
  });
  return {
    outcome: lines.some((line) =>
      /^verdict:\s*fail(?=$|\s*[.,;!(—–]| - )/i.test(line),
    )
      ? "fail"
      : /^verdict:\s*pass(?=$|\s*[.,;!(—–]| - )/i.test(
            lines.find(Boolean) ?? "",
          )
        ? "pass"
        : "no verdict",
    depth,
  };
}

export const byPrint = (t: Task, print: string | undefined): print is string =>
  print !== undefined && t.basePrint !== undefined;

// Whether code changed since the task began: by git when it can tell, else by the edits seen.
export const changed = (t: Task, print: string | undefined): boolean =>
  byPrint(t, print) ? print !== t.basePrint : t.lastEditAt > 0;
export const gateLevel = (t: Task): number =>
  Math.max(t.gateV ?? 0, t.track === "heavy" ? 2 : 0);
export const roundOf = (t: Task, print: string | undefined): string =>
  byPrint(t, print) ? print : String(t.lastEditAt);

// A real test pass on this code: a failure equal to the baseline also marks the kind as run
// (flow-kinds.ts) but proves nothing about the change.
const testPassed = (t: Task, print: string | undefined): boolean =>
  !(t.openKinds ?? []).includes("test") &&
  t.baseline?.test === undefined &&
  (byPrint(t, print)
    ? t.passedPrints?.test === print
    : (t.passedAt?.test ?? 0) > t.lastEditAt);

// Verify tiers: when the kit:verifier is wanted, and why. V3 always; a heavy task (V2) only when
// its other evidence is thin: no real test pass on this code, or no reviewer could run this
// round. A verifier that failed stays wanted until it passes. Below that: checks and review only.
export function verifierReason(
  t: Task,
  print: string | undefined,
): string | undefined {
  if (t.verifier === "fail") return "it reported failures";
  if (gateLevel(t) >= 3) return "a V3 task";
  if (t.track !== "heavy") return undefined;
  if (!testPassed(t, print)) return "no passing test run on this code";
  // the excuse lapses once a review passed after all (e.g. Gemini after GPT had no room)
  if (t.noReviewer?.round === roundOf(t, print) && reviewProblem(t, print))
    return "no reviewer this round";
  return undefined;
}
export const needsVerifier = (t: Task, print: string | undefined): boolean =>
  verifierReason(t, print) !== undefined;

const checked = (t: Task, print: string | undefined) =>
  !(t.openKinds ?? []).length &&
  (byPrint(t, print)
    ? t.checkedPrint === print
    : t.lastCheckAt > t.lastEditAt) &&
  !requiredMissing(t, print).length;
const verifierCurrent = (t: Task, print: string | undefined) =>
  byPrint(t, print)
    ? t.verifiedPrint === print
    : t.lastVerifierAt > t.lastEditAt;
// A review counts when some other family than the reviewer wrote the code; no recorded writer
// means Claude (this chat). Below V3 a fresh Claude reviewer counts too, whoever wrote it: a
// second pair of eyes that needs no other subscription. V3 (risky work) keeps another family.
const writers = (t: Task): Family[] => {
  const w: Family[] = [];
  if (t.gptWrote) w.push("gpt");
  if (t.geminiWrote) w.push("gemini");
  if (t.claudeWrote || w.length === 0) w.push("claude");
  return w;
};
const otherFamily = (t: Task, family: Family) =>
  writers(t).some((w) => w !== family);
const reviewCounts = (t: Task, family: Family) =>
  otherFamily(t, family) || (family === "claude" && gateLevel(t) < 3);

export function reviewProblem(
  t: Task,
  print: string | undefined,
): string | undefined {
  const r = t.review;
  if (
    r?.outcome === "fail" &&
    (byPrint(t, print) ? r.print === print : r.at > t.lastEditAt)
  )
    return "the reviewer reported P0/P1 findings: fix them, then review again";
  if (
    gateLevel(t) < 3 &&
    t.verifier === "pass" &&
    verifierCurrent(t, print) &&
    otherFamily(t, "claude")
  )
    return undefined;
  if (!r) return "no review yet";
  if (byPrint(t, print) ? r.print !== print : r.at <= t.lastEditAt)
    return "the code changed after the review";
  if (r.outcome === "error")
    return `the review run failed${r.error ? `: ${r.error}` : ""}`;
  if (r.outcome === "fail")
    return "the reviewer reported P0/P1 findings: fix them, then review again";
  if (r.outcome === "no verdict") return "the review had no `verdict:` line";
  if (!reviewCounts(t, r.family))
    return t.gptWrote || t.geminiWrote
      ? `${t.gptWrote ? "GPT" : "Gemini"} wrote the code: call mcp__kit__delegate role review with author ${t.gptWrote ? "gpt" : "gemini"} to use another family`
      : 'Claude wrote the code and a V3 review needs another family: mcp__kit__delegate role review for GPT; no room → wait, or the user says "skip verify"';
  if (gateLevel(t) >= 3 && !r.depth)
    return "a V3 review needs a `failure-paths:` line";
  return undefined;
}

const checkNeeds = (t: Task, print?: string): string[] => [
  ...(t.openKinds ?? []).map(
    (kind) =>
      `a passing ${KIND_RUN[kind]} on this code (${KIND_NAME[kind]} failed earlier)`,
  ),
  ...requiredMissing(t, print)
    .filter((kind) => !(t.openKinds ?? []).includes(kind))
    .map(
      (kind) =>
        `a passing ${KIND_RUN[kind]} on this code (${listedIn(t)} lists it)`,
    ),
];
// No command this task was recognised as a check (a masked one counts as seen): the generic
// "a passing check" would send the model hunting for something it cannot name.
export const noCheckSeen = (t: Task): boolean =>
  !t.checks &&
  !t.failed &&
  !t.checkCalls &&
  !(t.openKinds ?? []).length &&
  !Object.keys(t.passedAt ?? {}).length &&
  !Object.keys(t.baseline ?? {}).length;
const baselineNote = (t: Task): string => {
  const kinds = Object.keys(t.baseline ?? {}).filter(
    (k) => !(t.openKinds ?? []).includes(k as CheckKind),
  );
  return kinds.length
    ? ` Pre-existing, unchanged failures (not this task's): ${kinds.join(", ")}.`
    : "";
};

export function missing(t: Task, print: string | undefined): string[] {
  const wants: string[] = [];
  if (!checked(t, print))
    wants.push(
      ...(checkNeeds(t, print).length
        ? checkNeeds(t, print)
        : [
            noCheckSeen(t)
              ? `a passing check on this code (${noCheckNote(t)}. ${noCheckAdvice})`
              : "a passing check on this code",
          ]),
    );
  const why = verifierReason(t, print);
  if (why && !verifierCurrent(t, print))
    wants.push(`the kit:verifier on the task criteria (${why})`);
  const problem = gateLevel(t) >= 2 ? reviewProblem(t, print) : undefined;
  if (problem) wants.push(`a review: ${problem}`);
  return wants;
}

export const verified = (t: Task, print: string | undefined): boolean =>
  !changed(t, print) || !missing(t, print).length;
export const isOpen = (t: Task, print: string | undefined): boolean =>
  changed(t, print) && !verified(t, print) && !t.stopAsked;

export const onReview = (task: Task, record: ReviewRecord): Task => {
  const previous = task.review;
  const sameCode =
    record.print !== undefined
      ? previous?.print === record.print
      : previous?.print === undefined && (previous?.at ?? 0) > task.lastEditAt;
  // A run without a verdict says less than one with it.
  const noVerdict =
    record.outcome === "error" || record.outcome === "no verdict";
  const weaker =
    sameCode &&
    noVerdict &&
    (previous?.outcome === "pass" || previous?.outcome === "fail");
  // A stand-in (Claude for any other family, Gemini for GPT) may not displace those findings:
  // not on code that did not change (with any outcome, or a stand-in's fail would open the way
  // for its pass), nor with a late answer that started before them.
  const standsIn =
    (record.family === "claude" && previous?.family !== "claude") ||
    (record.family === "gemini" && previous?.family === "gpt");
  const displaces =
    standsIn &&
    previous?.outcome === "fail" &&
    (sameCode || record.at < previous.at);
  if (weaker || displaces) return task;
  // a reviewer did run on the excused code: the excuse no longer filters its verdict out of
  // holds. A late review of older code leaves a newer round's excuse alone.
  const excused = task.noReviewer;
  if (
    excused &&
    (record.outcome === "pass" || record.outcome === "fail") &&
    (record.print !== undefined
      ? record.print === excused.round
      : record.at > task.lastEditAt)
  )
    return { ...task, review: record, noReviewer: undefined };
  return { ...task, review: record };
};
export const onNoReviewer = (
  task: Task,
  reason: string,
  print: string | undefined,
): Task => ({ ...task, noReviewer: { round: roundOf(task, print), reason } });

const short = (files: string[]) =>
  !files.length
    ? "Code"
    : files.length > 3
      ? `${files.slice(0, 3).join(", ")} and ${files.length - 3} more`
      : files.join(", ");

export function openLine(
  t: Task | undefined,
  print: string | undefined,
): string {
  if (!t || !changed(t, print) || verified(t, print)) return "open: none";
  const prefix = `open: ${t.track} task, ${short(t.files)}: `;
  if (t.stopAsked) return prefix + "waived, closes at the next request";
  if (!isOpen(t, print)) return "open: none";
  const reason =
    t.noReviewer?.round === roundOf(t, print)
      ? `; no reviewer: ${t.noReviewer.reason}`
      : "";
  return (
    prefix +
    `still needs ${missing(t, print).join("; ")}${reason}. "skip verify" waives it.`
  );
}

export function holdText(
  t: Task,
  print: string | undefined,
  review = true,
): string {
  const sentences: string[] = [];
  if (!checked(t, print)) {
    const needs = checkNeeds(t, print);
    const run =
      "that covers the change (test, typecheck or lint, without a pipe that hides its exit " +
      "code) and fix what fails. This project has no such check → say so and stop.";
    sentences.push(
      needs.length
        ? `kit flow: ${short(t.files)} still needs ${needs.join("; ")}. Run each missing check ${run}${baselineNote(t)}`
        : noCheckSeen(t)
          ? `kit flow: ${short(t.files)} changed and ${noCheckNote(t)}. ${noCheckAdvice} Run it without a pipe that hides its exit code and fix what fails. This project has no such check → say so and stop.${baselineNote(t)}`
          : `kit flow: ${short(t.files)} changed after the last passing check. Run the check ${run}${baselineNote(t)}`,
    );
  }
  const why = verifierReason(t, print);
  if (why && !verifierCurrent(t, print))
    sentences.push(
      t.verifier === "fail"
        ? `kit flow: the kit:verifier reported failures on this ${t.track} task: fix them, then run ` +
            "it again."
        : `kit flow: this ${t.track} task has no current verification yet (${why}): run ` +
            "the kit:verifier agent on its criteria before you finish" +
            (why === "no passing test run on this code"
              ? ", or a test run that covers the change."
              : "."),
    );
  const problem =
    review && gateLevel(t) >= 2 ? reviewProblem(t, print) : undefined;
  if (problem)
    sentences.push(
      `kit flow: ${problem}. Get a review via mcp__kit__delegate role review` +
        `${t.gptWrote ? " (author gpt when GPT wrote the code)" : t.geminiWrote ? " (author gemini when Gemini wrote the code)" : ""}. ` +
        "The review answer must start with `verdict: pass|fail`." +
        (gateLevel(t) < 3 || !t.review || t.gptWrote || t.geminiWrote
          ? " On the Claude route, put the footer from delegate’s answer word for word in the subagent prompt or it is not recognised as a review."
          : ""),
    );
  const other = sentences.length ? otherSession(t) : undefined;
  if (other) sentences.push(other);
  return sentences.join(" ");
}

export function reminderText(t: Task, print: string | undefined): string {
  const reason =
    t.noReviewer?.round === roundOf(t, print) ? `; ${t.noReviewer.reason}` : "";
  return (
    `kit flow: open work: ${short(t.files)} still needs ${missing(t, print).join("; ")}${reason}. ` +
    'Tell the user it is still open: finish it now, or they can say "skip verify" to waive it.'
  );
}

export { onCheck, reopen } from "./flow-kinds";

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
  // An answer that started before the one on record is stale: an old PASS must not clear a newer FAIL.
  if (now < (task.verifierStartedAt ?? 0)) return task;
  return passed
    ? {
        ...task,
        verifier: "pass",
        verifierStartedAt: now,
        lastVerifierAt: now,
        verifiedPrint: print,
      }
    : {
        ...task,
        verifier: "fail",
        verifierStartedAt: now,
        lastVerifierAt: 0,
        verifiedPrint: undefined,
      };
}
