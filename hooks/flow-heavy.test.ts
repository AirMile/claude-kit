import { expect, test } from "claude-code/testing";

import {
  needsVerifier,
  newTask,
  onCheck,
  onReview,
  onVerifier,
  stopVerdict,
  trackNote,
  verified,
  verifierPassed,
  type Task,
} from "./flow-policy";

test("the heavy note loads task-readiness and leaves commits to the user", () => {
  const note = trackNote("heavy");
  expect(note).toContain("kit:task-readiness");
  expect(note).toContain("one exact check per criterion");
  expect(note).toContain("Commit or push nothing unless the user asks.");
  expect(note).not.toContain("kit:" + "build");
  expect(note).not.toContain("spec");
});

for (const basePrint of ["p0", undefined]) {
  test(`heavy work without a spec needs current verification (${basePrint ?? "no git"})`, async () => {
    const fix: Task = {
      ...newTask(1, "heavy", basePrint),
      files: ["src/a.ts"],
      lastEditAt: 5,
    };
    const checked = onCheck(fix, true, 6, "p1", "test");
    expect(stopVerdict(checked, "Done.", "p1").block).toContain("review");
    const reviewed = onReview(checked, {
      outcome: "pass",
      family: "gpt",
      depth: false,
      print: "p1",
      at: 6,
    });
    expect(needsVerifier(reviewed)).toBe(true);
    expect(reviewed.spec).toBe(false);
    expect(verified(reviewed, "p1")).toBe(false);
    expect(stopVerdict(reviewed, "Done.", "p1").block).toContain(
      "kit:verifier",
    );
    const verifiedTask = onVerifier(reviewed, true, 7, "p1");
    expect(verified(verifiedTask, "p1")).toBe(true);
    expect(stopVerdict(verifiedTask, "Done.", "p1").outcome).toBe("done");
    expect(verified({ ...verifiedTask, lastEditAt: 8 }, "p2")).toBe(false);
    expect(verified(onVerifier(reviewed, false, 7, "p1"), "p1")).toBe(false);
  });
}

test("heavy work with a spec accepts the verifier's PASS and holds failures", async () => {
  const feature = onCheck(
    { ...newTask(1, "heavy", "p0"), lastEditAt: 5, spec: true, gptWrote: true },
    true,
    6,
    "p1",
    "test",
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
