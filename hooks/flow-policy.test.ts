import { expect, test } from "claude-code/testing";

import {
  CHANGE_LABELS,
  changeOfLabel,
  newTask,
  onCheck,
  onEdit,
  onPrompt,
  onNoReviewer,
  onReview,
  onVerifier,
  stopVerdict,
  type Task,
  verifierPassed,
} from "./flow-policy";

const ask = (over: Partial<Parameters<typeof onPrompt>[0]>) =>
  onPrompt({
    task: undefined,
    kind: "routine",
    change: "light",
    build: false,
    thin: false,
    answering: false,
    text: "add a submit button",
    id: 1,
    print: "p0",
    ...over,
  });

test("a prompt's change picks the track; /build is heavy; a question or none starts nothing", async () => {
  expect(ask({}).task?.track).toBe("light");
  expect(ask({}).task?.basePrint).toBe("p0");
  expect(ask({}).note).toContain("run a check that covers it");
  expect(ask({ change: "heavy" }).note).toContain("Commit or push nothing");
  expect(ask({ build: true, change: undefined }).task?.track).toBe("heavy");
  expect(ask({ kind: "question", change: undefined }).task).toBe(undefined);
  expect(ask({ kind: "planning", change: "none" }).note).toBe(undefined);
  expect(ask({ change: "medium" }).note).toContain(
    "checks that cover the change",
  );
  // Who executes is task-policy's note alone.
  for (const change of ["light", "medium", "heavy"] as const)
    expect(ask({ change }).note).not.toContain("mcp__kit__delegate");
  expect(changeOfLabel(CHANGE_LABELS.medium)).toBe("medium");
});

test("a reply, a question or an answer keeps the task; open work folds", async () => {
  const task = { ...newTask(1, "heavy", "p0"), lastEditAt: 5 };
  expect(ask({ task, thin: true, change: undefined, text: "ja" }).event).toBe(
    "continue",
  );
  expect(ask({ task, kind: "question", change: undefined }).event).toBe(
    "continue",
  );
  // An answer to the turn's question during define keeps the heavy task.
  expect(ask({ task, answering: true, change: "light" }).task?.track).toBe(
    "heavy",
  );
  // Unverified work stays open when the next change request arrives.
  const next = ask({ task, change: "light", id: 2, print: "p1" });
  expect(next.event).toBe("fold");
  expect(next.ended).toBe(undefined);
  expect(next.task?.id).toBe(1);
  expect(next.task?.track).toBe("heavy");
  const up = ask({ task: newTask(1, "light"), thin: true, change: "heavy" });
  expect(up.note).toContain("grew from light to heavy");
});

test("only an explicit skip turns the gate off: a stop button or 'no tests' is a request", async () => {
  expect(ask({ text: "voeg een stop-knop toe" }).task?.stopAsked).toBe(false);
  expect(ask({ text: "dit project heeft geen tests" }).task?.stopAsked).toBe(
    false,
  );
  expect(ask({ text: "fix it, skip the checks" }).task?.stopAsked).toBe(true);
  expect(ask({ text: "doe het zonder te testen" }).task?.stopAsked).toBe(true);
});

test("with git, a check counts for the worktree it started on; a failure wipes it", async () => {
  const t = {
    ...newTask(1, "light", "p0"),
    files: ["src/a.ts"],
    lastEditAt: 5,
  };
  expect(stopVerdict(t, "Done.", "p0").outcome).toBe("none"); // nothing changed per git
  expect(stopVerdict(t, "Done.", "p1").outcome).toBe("block");
  const checked = onCheck(t, true, 6, "p1");
  expect(stopVerdict(checked, "Done.", "p1").outcome).toBe("done");
  expect(stopVerdict(checked, "Done.", "p2").outcome).toBe("block"); // changed after it
  const failed = onCheck(checked, false, 7, "p1");
  expect(stopVerdict(failed, "Done.", "p1").outcome).toBe("block");
});

test("the gate holds once per round and twice per request, never on a question", async () => {
  const t: Task = {
    ...newTask(1, "light"),
    files: ["src/a.ts"],
    lastEditAt: 5,
  };
  const first = stopVerdict(t, "Done.", undefined);
  expect(first.block).toContain(
    "src/a.ts changed after the last passing check",
  );
  expect(stopVerdict(first.task, "Done.", undefined).outcome).toBe(
    "pass-unverified",
  );
  const second = stopVerdict(
    { ...first.task!, lastEditAt: 7 },
    "Done.",
    undefined,
  );
  expect(second.outcome).toBe("block");
  expect(
    stopVerdict({ ...second.task!, lastEditAt: 9 }, "Done.", undefined).outcome,
  ).toBe("pass-unverified");
  expect(stopVerdict(t, "Shall I add a test?", undefined).outcome).toBe(
    "pass-question",
  );
  expect(stopVerdict({ ...t, stopAsked: true }, "Ok.", undefined).outcome).toBe(
    "pass-asked",
  );
});

test("heavy work needs a review; a spec also needs the verifier's PASS", async () => {
  const fix: Task = {
    ...newTask(1, "heavy", "p0"),
    files: ["src/a.ts"],
    lastEditAt: 5,
  };
  const checked = onCheck(fix, true, 6, "p1");
  expect(stopVerdict(checked, "Done.", "p1").block).toContain("review");
  const reviewed = onReview(checked, {
    outcome: "pass",
    family: "gpt",
    depth: false,
    print: "p1",
    at: 6,
  });
  expect(stopVerdict(reviewed, "Done.", "p1").outcome).toBe("done");
  const feature = onCheck(
    { ...fix, spec: true, gptWrote: true },
    true,
    6,
    "p1",
  );
  expect(stopVerdict(feature, "Done.", "p1").block).toContain("kit:verifier");
  const pass =
    "VERIFY login\nsuite: pass (npm test, 9 passed)\ncriteria:\n- [pass] it logs in — test";
  const fail =
    "VERIFY login\nsuite: pass\ncriteria:\n- [fail] errors show — missing";
  expect(verifierPassed(pass)).toBe(true);
  expect(verifierPassed(fail)).toBe(false);
  expect(
    stopVerdict(onVerifier(feature, true, 7, "p1"), "Done.", "p1").outcome,
  ).toBe("done");
  expect(
    stopVerdict(onVerifier(feature, false, 7, "p1"), "Done.", "p1").block,
  ).toContain("reported failures");
});

test("a V2 hold names check and review at once; no reviewer excuses only this round's review hold", async () => {
  const task = {
    ...newTask(1, "light", "p0"),
    gateV: 2 as const,
    lastEditAt: 5,
  };
  const hold = stopVerdict(task, "Done.", "p1");
  expect(hold.block).toContain("last passing check");
  expect(hold.block).toContain("no review yet");
  const refused = onNoReviewer(task, "GPT is off", "p1");
  const checkHold = stopVerdict(refused, "Done.", "p1");
  expect(checkHold.block).toContain("last passing check");
  expect(checkHold.block).not.toContain("review");
  const checked = onCheck(refused, true, 6, "p1");
  const pass = stopVerdict(checked, "Done.", "p1");
  expect(pass.outcome).toBe("pass-unverified");
  expect(pass.task?.unverified).toBe(true);
  expect(pass.ended).toBe(undefined);
  expect(
    stopVerdict(onCheck(pass.task!, true, 8, "p2"), "Done.", "p2").block,
  ).toContain("no review yet");
});

test("fold keeps the task and highest track, resets the request cap and counts only new files", async () => {
  const task: Task = {
    ...newTask(1, "light", "p0"),
    files: ["a.ts", "b.ts", "c.ts"],
    lastEditAt: 5,
    blocks: 2,
    blockedRound: "p1",
    unverified: true,
    gateV: 3,
  };
  const folded = ask({ task, print: "p1" });
  expect(folded.event).toBe("fold");
  expect(folded.task?.id).toBe(1);
  expect(folded.task?.gateV).toBe(3);
  expect(folded.task?.blocks).toBe(0);
  expect(folded.task?.unverified).toBe(false);
  expect(folded.task?.blockedRound).toBe("p1");
  expect(folded.task?.requestFiles).toBe(3);
  expect(folded.note).toContain("open work");
  expect(stopVerdict(folded.task, "Done.", "p1").outcome).toBe(
    "pass-unverified",
  );
  let t = onEdit(folded.task, "a.ts", 6, 2, "p1")!.task;
  t = onEdit(t, "d.ts", 7, 2, "p1")!.task;
  expect(t.track).toBe("light");
  for (const f of ["e", "f", "g"]) t = onEdit(t, `${f}.ts`, 8, 2, "p1")!.task;
  expect(t.track).toBe("medium");
  for (const f of ["h", "i", "j", "k", "l"])
    t = onEdit(t, `${f}.ts`, 9, 2, "p1")!.task;
  expect(t.track).toBe("heavy");
  expect(stopVerdict(t, "Done.", "p2").outcome).toBe("block");
  const grown = ask({ task, change: "heavy", print: "p1" });
  expect(grown.event).toBe("escalate");
  expect(grown.note).toContain("grew from light to heavy");
  expect(grown.note).toContain("open work");
});

test("non-change prompts keep open work with a reminder once per git or timestamp round", async () => {
  for (const basePrint of ["p0", undefined]) {
    const task = { ...newTask(1, "light", basePrint), lastEditAt: 5 };
    const next = ask({ task, print: "p1", change: "none" });
    expect(next.event).toBe("continue");
    expect(next.ended).toBe(undefined);
    expect(next.note).toContain("open work");
    const again = ask({ task: next.task, print: "p1", change: undefined });
    expect(again.note).toBe(undefined);
    const edited = { ...again.task!, lastEditAt: 6 };
    expect(ask({ task: edited, print: "p2", change: "none" }).note).toContain(
      "open work",
    );
    const folded = ask({ task: next.task, print: "p1" });
    expect(folded.note).toBe(undefined);
  }
  const task = { ...newTask(1, "light"), lastEditAt: 5, unverified: true };
  const reply = ask({ task, thin: true, change: "heavy", print: undefined });
  expect(reply.note).toContain("grew from light to heavy");
  expect(reply.note).toContain("open work");
  expect(
    ask({
      task: reply.task,
      kind: "question",
      change: undefined,
      print: undefined,
    }).note,
  ).toBe(undefined);
  expect(ask({ task: { ...task, unverified: false }, thin: true }).note).toBe(
    undefined,
  );
});

test("skip wording waives the ended task; verified or unchanged work still closes on a new request", async () => {
  const task = { ...newTask(1, "light", "p0"), lastEditAt: 5 };
  for (const text of [
    "sla verificatie over",
    "sla de verify over",
    "sla check over",
    "sla checks over",
    "sla tests over",
    "sla test over",
    "sla review over",
    "skip review",
    "skip the review",
    "geen review",
    "zonder review",
    "no review",
  ]) {
    const step = ask({ task, print: "p1", text });
    expect(step.ended?.stopAsked).toBe(true);
    expect(step.task?.stopAsked).toBe(true);
    expect(step.event).toBe("start");
  }
  expect(
    ask({ task, print: "p1", change: "none", text: "skip verify" }).ended
      ?.stopAsked,
  ).toBe(true);
  expect(ask({ task, thin: true, text: "skip review" }).task?.stopAsked).toBe(
    true,
  );
  const checked = onCheck(task, true, 6, "p1");
  for (const [t, print] of [
    [checked, "p1"],
    [task, "p0"],
  ] as const) {
    const next = ask({ task: t, print, id: 2 });
    expect(next.event).toBe("start");
    expect(next.ended?.id).toBe(1);
    expect(next.task?.id).toBe(2);
  }
  expect(ask({ task: checked, print: "p1", change: "none" }).task).toBe(
    undefined,
  );
});
