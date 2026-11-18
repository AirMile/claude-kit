import { expect, test } from "claude-code/testing";

import {
  byPrint,
  changed,
  gateLevel,
  holdText,
  isOpen,
  missing,
  needsVerifier,
  onCheck,
  onNoReviewer,
  openLine,
  onReview,
  onVerifier,
  parseReview,
  reminderText,
  reopen,
  reviewProblem,
  roundOf,
  verified,
  verifierPassed,
  type Family,
  type ReviewRecord,
} from "./flow-evidence";
import { newTask, type Task } from "./flow-policy";

const work = (over: Partial<Task> = {}): Task => ({
  ...newTask(1, "light", "p0"),
  files: ["src/a.ts"],
  lastEditAt: 5,
  gateV: 2,
  ...over,
});
const review = (over: Partial<ReviewRecord> = {}): ReviewRecord => ({
  outcome: "pass",
  family: "gpt",
  depth: false,
  print: "p1",
  at: 6,
  ...over,
});

test("review lines tolerate case and markdown; a fail beats any pass", async () => {
  for (const line of [
    "verdict: pass",
    "verdict: pass.",
    "- verdict: pass",
    "- **verdict:** pass",
    "**verdict:** pass",
    "**Verdict: PASS**",
    "verdict: pass — no findings",
    "verdict: pass (no P0/P1)",
    "  > ## **VERDICT: PASS**  ",
    "__`verdict: pass`__",
  ])
    expect(parseReview(line)).toEqual({ outcome: "pass", depth: false });
  expect(
    parseReview("verdict: pass\n> **verdict: fail**\nverdict: pass").outcome,
  ).toBe("fail");
  for (const answer of [
    "passed",
    "The verdict: pass",
    "verdict: passing",
    "verdict: passes",
    "verdict: pass|fail",
    "verdict: fail|pass",
    "verdict: pass or verdict: fail",
    "verdict: pass would be wrong here",
    "[P1] finding\n> verdict: pass (fail = any P0)",
  ])
    expect(parseReview(answer).outcome).toBe("no verdict");
  for (const line of [
    "**verdict:** fail",
    "verdict: fail,",
    "- verdict: fail",
    "verdict: fail — findings",
    "verdict: fail (P1)",
  ])
    expect(parseReview(line).outcome).toBe("fail");
  expect(parseReview("```text\n\n- **verdict:** pass\n```").outcome).toBe(
    "pass",
  );
  expect(parseReview("finding\nverdict: fail.").outcome).toBe("fail");
  expect(parseReview("- failure-paths: retry").depth).toBe(true);
  expect(parseReview("**failure-paths:** timeout and integration").depth).toBe(
    true,
  );
  for (const text of [
    "",
    "none",
    "N/A",
    "-",
    "—",
    "**none**",
    "none.",
    "n/a!",
    "—.",
    "<describe failure paths>",
  ])
    expect(
      parseReview(`verdict: pass\n> **failure-paths: ${text}**`).depth,
    ).toBe(false);
  expect(
    parseReview("VERDICT: FAIL\n > ## __FAILURE-PATHS: timeout and rollback__"),
  ).toEqual({
    outcome: "fail",
    depth: true,
  });
  expect(parseReview("failure-paths: none\nfailure-paths: retry").depth).toBe(
    true,
  );
});

test("heavy floors the gate at V2; V0/V1 need only the passing check", async () => {
  expect(gateLevel(newTask(1, "light"))).toBe(0);
  expect(gateLevel(work({ track: "heavy", gateV: 0 }))).toBe(2);
  expect(gateLevel(work({ track: "heavy", gateV: 3 }))).toBe(3);
  for (const gateV of [0, 1] as const) {
    const t = work({ gateV, levels: { d: 1, e: 0, v: 3, r: 0 } });
    expect(missing(t, "p1")).toEqual(["a passing check on this code"]);
    expect(verified(onCheck(t, true, 6, "p1", "test"), "p1")).toBe(true);
  }
  const t = onCheck(work(), true, 6, "p1", "test");
  expect(missing(t, "p1")).toEqual(["a review: no review yet"]);
  expect(verified(t, "p1")).toBe(false);
  expect(verified(onReview(t, review()), "p1")).toBe(true);
});

test("the reviewer must be the other family, with either allowed for mixed writers", async () => {
  for (const [gptWrote, claudeWrote] of [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ]) {
    for (const family of ["gpt", "claude"] as Family[]) {
      const t = onReview(work({ gptWrote, claudeWrote }), review({ family }));
      const counts = family === "gpt" ? !gptWrote || claudeWrote : gptWrote;
      expect(reviewProblem(t, "p1") === undefined).toBe(counts);
    }
  }
  expect(
    reviewProblem(onReview(work(), review({ family: "claude" })), "p1"),
  ).toContain("Claude wrote");
  expect(
    reviewProblem(onReview(work({ gptWrote: true }), review()), "p1"),
  ).toContain("author gpt");
});

test("Gemini counts as its own family: it reviews Claude's or GPT's code, never its own", async () => {
  const ok = (w: Partial<Task>, family: Family) =>
    reviewProblem(onReview(work(w), review({ family })), "p1") === undefined;
  expect(ok({ claudeWrote: true }, "gemini")).toBe(true);
  expect(ok({ gptWrote: true }, "gemini")).toBe(true);
  expect(ok({ geminiWrote: true }, "gemini")).toBe(false);
  expect(ok({ geminiWrote: true }, "gpt")).toBe(true);
  expect(ok({ geminiWrote: true }, "claude")).toBe(true);
  expect(ok({ geminiWrote: true, claudeWrote: true }, "gemini")).toBe(true);
  expect(
    reviewProblem(
      onReview(work({ geminiWrote: true }), review({ family: "gemini" })),
      "p1",
    ),
  ).toContain("author gemini");
});

test("a current verifier PASS counts as Claude at V2, while V3 needs a review", async () => {
  for (const gptWrote of [false, true]) {
    const t = onVerifier(work({ gptWrote, gateV: 2 }), true, 6, "p1");
    expect(reviewProblem(t, "p1") === undefined).toBe(gptWrote);
    expect(reviewProblem({ ...t, claudeWrote: true }, "p1") === undefined).toBe(
      gptWrote,
    );
    expect(reviewProblem(t, "p2")).toBe("no review yet");
    expect(reviewProblem({ ...t, gateV: 3 }, "p1")).toBe("no review yet");
    const noGit = { ...t, basePrint: undefined };
    expect(reviewProblem(noGit, undefined) === undefined).toBe(gptWrote);
    expect(reviewProblem({ ...noGit, lastVerifierAt: 5 }, undefined)).toBe(
      "no review yet",
    );
  }
  const t = onVerifier(work({ gptWrote: true }), true, 6, "p1");
  expect(reviewProblem(onReview(t, review({ outcome: "fail" })), "p1")).toBe(
    "the reviewer reported P0/P1 findings: fix them, then review again",
  );
  expect(
    reviewProblem(onReview(t, review({ outcome: "fail", print: "old" })), "p1"),
  ).toBe(undefined);
  const noGit = { ...t, basePrint: undefined };
  expect(
    reviewProblem(
      onReview(noGit, review({ outcome: "fail", at: 5 })),
      undefined,
    ),
  ).toBe(undefined);
  expect(
    reviewProblem(
      onReview(noGit, review({ outcome: "fail", at: 6 })),
      undefined,
    ),
  ).toContain("P0/P1");
  expect(reviewProblem(onVerifier(t, false, 7, "p1"), "p1")).toBe(
    "no review yet",
  );
});

test("each review problem identifies the failure, in order", async () => {
  const t = work({ gateV: 3 });
  const problems = [
    reviewProblem(t, "p1"),
    reviewProblem(
      onReview(t, review({ outcome: "error", error: "offline" })),
      "p1",
    ),
    reviewProblem(onReview(t, review({ outcome: "fail" })), "p1"),
    reviewProblem(onReview(t, review({ outcome: "no verdict" })), "p1"),
    reviewProblem(onReview(t, review({ family: "claude" })), "p1"),
    reviewProblem(onReview(t, review({ print: "p0" })), "p1"),
    reviewProblem(onReview(t, review()), "p1"),
  ];
  expect(new Set(problems).size).toBe(7);
  for (const [n, fragment] of [
    "no review yet",
    "run failed",
    "P0/P1",
    "no `verdict:`",
    "Claude wrote",
    "code changed",
    "failure-paths:",
  ].entries())
    expect(problems[n]).toContain(fragment);
  expect(problems[1]).toContain("offline");
  expect(problems[2]).toContain("review again");
  expect(reviewProblem(onReview(t, review({ depth: true })), "p1")).toBe(
    undefined,
  );
  expect(
    reviewProblem(onReview(t, review({ outcome: "error" })), "p1"),
  ).toContain("run failed");
  expect(
    reviewProblem(
      onReview(t, review({ outcome: "fail", family: "claude", print: "old" })),
      "p1",
    ),
  ).toContain("code changed");
  for (const outcome of ["pass", "fail", "error", "no verdict"] as const)
    expect(
      reviewProblem(onReview(t, review({ outcome, print: "old" })), "p1"),
    ).toContain("code changed");
});

test("review evidence is tied to its start print or strictly later start time without git", async () => {
  const t = onReview(work(), review());
  expect(reviewProblem(t, "p2")).toContain("code changed");
  expect(
    reviewProblem(onReview(work(), review({ print: undefined })), "p1"),
  ).toContain("code changed");
  const noGit = { ...t, basePrint: undefined };
  expect(reviewProblem(noGit, undefined)).toBe(undefined);
  expect(reviewProblem({ ...noGit, lastEditAt: 6 }, undefined)).toContain(
    "code changed",
  );
  expect(reviewProblem({ ...noGit, lastEditAt: 7 }, "p1")).toContain(
    "code changed",
  );
  const later = review({ outcome: "fail", at: 9 });
  expect(onReview(t, later).review).toEqual(later);
  expect(t.review?.outcome).toBe("pass");
});

test("a hold names every missing item and preserves the check and verifier sentences", async () => {
  const t = work({ track: "heavy", spec: true });
  expect(needsVerifier(t)).toBe(true);
  expect(missing(t, "p1").length).toBe(3);
  const hold = holdText(t, "p1");
  expect(hold).toContain(
    "src/a.ts changed after the last passing check. Run the check",
  );
  expect(hold).toContain(
    "this heavy task has no current verification yet",
  );
  expect(hold).toContain("mcp__kit__delegate role review");
  expect(hold).toContain("no review yet");
  expect(hold).toContain("verdict: pass|fail");
  expect(hold).toContain("footer from delegate’s answer word for word");
  expect(
    holdText(onReview(t, review({ outcome: "error" })), "p1"),
  ).not.toContain("footer from delegate");
  expect(holdText({ ...t, gptWrote: true }, "p1")).toContain("author gpt");
  expect(
    holdText(
      onReview({ ...t, gptWrote: true }, review({ outcome: "error" })),
      "p1",
    ),
  ).toContain("footer from delegate");
  expect(holdText({ ...t, verifier: "fail" }, "p1")).toContain(
    "reported failures",
  );
  expect(holdText(t, "p1", false)).not.toContain("review");
  const passed = onVerifier(
    onCheck({ ...t, gptWrote: true }, true, 6, "p1", "test"),
    true,
    7,
    "p1",
  );
  expect(missing(passed, "p1")).toEqual([]);
  expect(verified(passed, "p1")).toBe(true);
  expect(verifierPassed("suite: pass\n- [unclear] timeout")).toBe(false);
});

test("rounds, reminders and open state follow git or edit time; no-reviewer reasons are per round", async () => {
  const t = work();
  expect(byPrint(t, "p1")).toBe(true);
  expect(roundOf(t, "p1")).toBe("p1");
  expect(roundOf({ ...t, basePrint: undefined }, "p1")).toBe("5");
  expect(changed(t, "p0")).toBe(false);
  expect(verified(t, "p0")).toBe(true);
  expect(isOpen(t, "p1")).toBe(true);
  expect(isOpen({ ...t, stopAsked: true }, "p1")).toBe(false);
  expect(
    isOpen(onReview(onCheck(t, true, 6, "p1", "test"), review()), "p1"),
  ).toBe(false);
  const refused = onNoReviewer(t, "GPT is off", "p1");
  expect(refused.noReviewer).toEqual({ round: "p1", reason: "GPT is off" });
  expect(t.noReviewer).toBe(undefined);
  expect(
    onNoReviewer({ ...t, basePrint: undefined }, "offline", undefined)
      .noReviewer?.round,
  ).toBe("5");
  const note = reminderText(refused, "p1");
  expect(note).toContain("kit flow: open work: src/a.ts still needs");
  expect(note).toContain("a passing check on this code");
  expect(note).toContain("a review: no review yet");
  expect(note).toContain("GPT is off");
  expect(note).toContain(
    'Tell the user it is still open: finish it now, or they can say "skip verify" to waive it.',
  );
  expect(note).toContain('"skip verify"');
  expect(reminderText(refused, "p2")).not.toContain("GPT is off");
});

test("open line describes current evidence, waiver and closed work", async () => {
  const t = work({ files: ["a", "b", "c", "d"] });
  expect(openLine(undefined, "p1")).toBe("open: none");
  expect(openLine(t, "p0")).toBe("open: none");
  const line =
    'open: light task, a, b, c and 1 more: still needs a passing check on this code; a review: no review yet. "skip verify" waives it.';
  expect(openLine(t, "p1")).toBe(line);
  const refused = onNoReviewer(t, "GPT is off", "p1");
  expect(openLine(refused, "p1")).toContain("; no reviewer: GPT is off.");
  expect(openLine(refused, "p2")).not.toContain("GPT is off");
  expect(openLine({ ...t, stopAsked: true }, "p1")).toBe(
    "open: light task, a, b, c and 1 more: waived, closes at the next request",
  );
  expect(
    openLine(onReview(onCheck(t, true, 6, "p1", "test"), review()), "p1"),
  ).toBe("open: none");
});

test("inconclusive reviews preserve a current pass or fail on the same code", async () => {
  for (const prior of ["pass", "fail"] as const) {
    const t = onReview(work(), review({ outcome: prior }));
    for (const outcome of ["error", "no verdict"] as const) {
      expect(onReview(t, review({ outcome, at: 7 })).review).toEqual(t.review);
      expect(
        onReview(t, review({ outcome, print: "p2" })).review?.outcome,
      ).toBe(outcome);
      const noGit = onReview(
        work({ basePrint: undefined }),
        review({ print: undefined, outcome: prior }),
      );
      expect(
        onReview(noGit, review({ outcome, print: undefined, at: 7 })).review,
      ).toEqual(noGit.review);
      expect(
        onReview(
          { ...noGit, lastEditAt: 6 },
          review({ outcome, print: undefined }),
        ).review?.outcome,
      ).toBe(outcome);
    }
  }
});

test("failed tests stay open after lint; holds, open lines and reminders name them", async () => {
  const failed = onCheck(work({ gateV: 0 }), false, 6, "p1", "test");
  const linted = onCheck(failed, true, 7, "p1", "static");
  expect(linted.openKinds).toEqual(["test"]);
  expect(linted.checks).toBe(1);
  expect(linted.failed).toBe(1);
  expect(linted.lastCheckAt).toBe(0);
  expect(linted.checkedPrint).toBe(undefined);
  expect(verified(linted, "p1")).toBe(false);
  expect(missing(linted, "p1")).toEqual([
    "a passing test run on this code (tests failed earlier)",
  ]);
  expect(holdText(linted, "p1")).toContain("tests failed earlier");
  expect(holdText(linted, "p1")).toContain("pipe that hides its exit code");
  expect(openLine(linted, "p1")).toContain("tests failed earlier");
  expect(reminderText(linted, "p1")).toContain("tests failed earlier");
  expect(verified({ ...linted, checkedPrint: "p1" }, "p1")).toBe(false);
});

test("only a pass of each failed kind restores evidence, including after edits", async () => {
  for (const basePrint of ["p0", undefined]) {
    let t = work({ gateV: 0, basePrint });
    t = onCheck(t, false, 6, "p1", "test");
    t = onCheck(t, false, 7, "p1", "test");
    expect(t.openKinds).toEqual(["test"]);
    t = onCheck({ ...t, lastEditAt: 8 }, true, 9, "p2", "test");
    expect(t.openKinds).toEqual([]);
    expect(verified(t, "p2")).toBe(true);
    t = onCheck(t, false, 10, "p2", "test");
    expect(verified(t, "p2")).toBe(false);
    t = onCheck(t, false, 11, "p2", "build");
    t = onCheck(t, true, 12, "p2", "test");
    expect(t.openKinds).toEqual(["build"]);
    expect(verified(t, "p2")).toBe(false);
    expect(holdText(t, "p2")).toContain("the build failed earlier");
    t = onCheck(t, true, 13, "p2", "build");
    expect(verified(t, "p2")).toBe(true);
  }
});

test("old tasks need just one pass; all open kinds are named", async () => {
  const old = work({ gateV: 0, openKinds: undefined });
  expect(verified(onCheck(old, true, 6, "p1", "static"), "p1")).toBe(true);
  let t = onCheck(old, false, 6, "p1", "build");
  t = onCheck(t, true, 7, "p1", "test");
  expect(verified(t, "p1")).toBe(false);
  t = onCheck(t, false, 8, "p1", "static");
  expect(openLine(t, "p1")).toContain("the build failed earlier");
  expect(openLine(t, "p1")).toContain("typecheck/lint failed earlier");
});

test("an older passing run cannot close a newer failure of the same kind", async () => {
  for (const basePrint of ["p0", undefined]) {
    for (const kind of ["test", "static", "build"] as const) {
      const failed = onCheck(
        work({ gateV: 0, basePrint, lastEditAt: 15 }),
        false,
        20,
        "p2",
        kind,
      );
      const stale = onCheck(failed, true, 10, "p1", kind);
      expect(stale.openKinds).toEqual([kind]);
      expect(stale.failedAt?.[kind]).toBe(20);
      expect(stale.checks).toBe(1);
      expect(stale.failed).toBe(1);
      expect(stale.lastCheckAt).toBe(0);
      expect(stale.checkedPrint).toBe(undefined);
      expect(verified(stale, "p2")).toBe(false);
      for (const startedAt of [20, 21]) {
        const current = onCheck(stale, true, startedAt, "p2", kind);
        expect(current.openKinds).toEqual([]);
        expect(current.failedAt?.[kind]).toBe(undefined);
        expect(current.checks).toBe(2);
        expect(verified(current, "p2")).toBe(true);
        expect(stale.failedAt?.[kind]).toBe(20);
      }
    }
  }
});

test("failure timestamps are per kind and old tasks need no migration", async () => {
  const old = work({ gateV: 0, openKinds: ["test"] });
  expect(verified(onCheck(old, true, 6, "p1", "test"), "p1")).toBe(true);
  const tests = onCheck(work({ gateV: 0 }), false, 20, "p2", "test");
  const both = onCheck(tests, false, 30, "p2", "static");
  const partly = onCheck(both, true, 20, "p2", "test");
  expect(partly.openKinds).toEqual(["static"]);
  expect(partly.failedAt?.test).toBe(undefined);
  expect(partly.failedAt?.static).toBe(30);
  expect(partly.lastCheckAt).toBe(0);
  expect(partly.checkedPrint).toBe(undefined);
  expect(verified(onCheck(partly, true, 30, "p2", "static"), "p2")).toBe(true);
});

test("overlapping failures never lower failedAt; edits reopen closed kinds; compound runs", async () => {
  let t = onCheck(work({ gateV: 0 }), false, 30, "p1", "test");
  t = onCheck(t, false, 10, "p1", "test");
  expect(t.failedAt?.test).toBe(30);
  t = onCheck(t, true, 20, "p1", "test");
  expect(t.openKinds).toEqual(["test"]);
  expect(verified(t, "p1")).toBe(false);

  // tests fail, a test pass closes them on p1, then an edit: a lint pass alone must not verify
  t = onCheck(work({ gateV: 0 }), false, 10, "p1", "test");
  t = onCheck(t, true, 11, "p1", "test");
  expect(t.closedKinds).toEqual(["test"]);
  expect(verified(t, "p1")).toBe(true);
  t = reopen({ ...t, lastEditAt: 12 }, 12);
  expect(t.openKinds).toEqual(["test"]);
  t = onCheck(t, true, 13, "p2", "static");
  expect(verified(t, "p2")).toBe(false);
  // a test run that started before the edit cannot close it either
  t = onCheck(t, true, 11, "p1", "test");
  expect(t.openKinds).toEqual(["test"]);
  t = onCheck(t, true, 14, "p2", "test");
  expect(t.openKinds).toEqual([]);
  expect(verified(t, "p2")).toBe(true);

  // a run that was already started before the edit and passes after it: still open
  let u = onCheck(work({ gateV: 0 }), false, 10, "p1", "test");
  u = reopen({ ...u, lastEditAt: 15 }, 15);
  u = onCheck(u, true, 12, "p1", "test");
  expect(u.openKinds).toEqual(["test"]);
  expect(verified(u, "p2")).toBe(false);

  // compound: failure opens both kinds, a lint pass alone does not close tests, a full pass does
  let c = onCheck(work({ gateV: 0 }), false, 10, "p1", ["static", "test"]);
  expect(c.openKinds).toEqual(["static", "test"]);
  c = onCheck(c, true, 11, "p1", "static");
  expect(verified(c, "p1")).toBe(false);
  c = onCheck(c, true, 12, "p1", ["static", "test"]);
  expect(verified(c, "p1")).toBe(true);
});

test("a pass on other code reopens kinds that were closed on older code (a Bash edit)", async () => {
  let t = onCheck(work({ gateV: 0 }), false, 10, "p1", "test");
  t = onCheck(t, true, 11, "p1", "test");
  expect(verified(t, "p1")).toBe(true);
  // a formatter changed the code without an edit event: a lint pass on p2 is not enough
  t = onCheck(t, true, 12, "p2", "static");
  expect(t.openKinds).toEqual(["test"]);
  expect(verified(t, "p2")).toBe(false);
  t = onCheck(t, true, 13, "p2", "test");
  expect(t.openKinds).toEqual([]);
  expect(verified(t, "p2")).toBe(true);
  // the same print keeps a closed kind closed
  let u = onCheck(work({ gateV: 0 }), false, 10, "p1", "test");
  u = onCheck(u, true, 11, "p1", "test");
  u = onCheck(u, true, 12, "p1", "static");
  expect(u.openKinds).toEqual([]);
  expect(verified(u, "p1")).toBe(true);
});
