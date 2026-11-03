import type { Task } from "./flow-policy";

// Evidence, pure: checks and reviews belong to the code they started on, by git's fingerprint
// or, without git, the order of observed edits. A missing reviewer excuses a hold, not evidence.
export type Family = "gpt" | "claude";
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
export const needsVerifier = (t: Task): boolean =>
  t.track === "heavy" && t.spec;
export const gateLevel = (t: Task): number =>
  Math.max(t.gateV ?? 0, t.track === "heavy" ? 2 : 0);
export const roundOf = (t: Task, print: string | undefined): string =>
  byPrint(t, print) ? print : String(t.lastEditAt);

const checked = (t: Task, print: string | undefined) =>
  byPrint(t, print) ? t.checkedPrint === print : t.lastCheckAt > t.lastEditAt;
const verifierCurrent = (t: Task, print: string | undefined) =>
  byPrint(t, print)
    ? t.verifiedPrint === print
    : t.lastVerifierAt > t.lastEditAt;
const familyCounts = (t: Task, family: Family) =>
  family === "gpt" ? !t.gptWrote || !!t.claudeWrote : !!t.gptWrote;

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
    familyCounts(t, "claude")
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
  if (!familyCounts(t, r.family))
    return t.gptWrote
      ? "GPT wrote the code: call mcp__kit__delegate role review with author gpt to use Claude"
      : "Claude wrote the code: use the other family, GPT, for the review";
  if (gateLevel(t) >= 3 && !r.depth)
    return "a V3 review needs a `failure-paths:` line";
  return undefined;
}

export function missing(t: Task, print: string | undefined): string[] {
  const wants: string[] = [];
  if (!checked(t, print)) wants.push("a passing check on this code");
  if (needsVerifier(t) && !verifierCurrent(t, print))
    wants.push("the kit:verifier on the spec");
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
  if (
    (record.outcome === "error" || record.outcome === "no verdict") &&
    (previous?.outcome === "pass" || previous?.outcome === "fail") &&
    (record.print !== undefined
      ? previous.print === record.print
      : previous.print === undefined && previous.at > task.lastEditAt)
  )
    return task;
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
  if (!checked(t, print))
    sentences.push(
      `kit flow: ${short(t.files)} changed after the last passing check. Run the check ` +
        "that covers the change (test, typecheck or lint, without a pipe that hides its exit " +
        "code) and fix what fails. This project has no such check → say so and stop.",
    );
  if (needsVerifier(t) && !verifierCurrent(t, print))
    sentences.push(
      t.verifier === "fail"
        ? "kit flow: the kit:verifier reported failures on this heavy task: fix them, then run " +
            "it again."
        : "kit flow: the checks pass, but this heavy task's spec has no verification yet: run " +
            "the kit:verifier agent on it before you finish.",
    );
  const problem =
    review && gateLevel(t) >= 2 ? reviewProblem(t, print) : undefined;
  if (problem)
    sentences.push(
      `kit flow: ${problem}. Get a review via mcp__kit__delegate role review` +
        `${t.gptWrote ? " (author gpt when GPT wrote the code)" : ""}. ` +
        "The review answer must start with `verdict: pass|fail`." +
        (!t.review || t.gptWrote
          ? " On the Claude route, put the footer from delegate’s answer word for word in the subagent prompt or it is not recognised as a review."
          : ""),
    );
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
