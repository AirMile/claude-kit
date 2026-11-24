import { expect, test } from "claude-code/testing";

import {
  needsVerifier,
  newTask,
  onCheck,
  onNoReviewer,
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

const gpt = (print: string | undefined, at = 6, depth = false) => ({
  outcome: "pass" as const,
  family: "gpt" as const,
  depth,
  print,
  at,
});

for (const basePrint of ["p0", undefined]) {
  const print = basePrint && "p1";
  test(`heavy V2: a clean test pass plus an other-family review closes it without the verifier (${basePrint ?? "no git"})`, async () => {
    const fix: Task = {
      ...newTask(1, "heavy", basePrint),
      files: ["src/a.ts"],
      lastEditAt: 5,
    };
    const checked = onCheck(fix, true, 6, print, "test");
    expect(stopVerdict(checked, "Done.", print).block).toContain("review");
    expect(needsVerifier(checked, print)).toBe(false);
    const reviewed = onReview(checked, gpt(print, basePrint ? 6 : 7));
    expect(needsVerifier(reviewed, print)).toBe(false);
    expect(verified(reviewed, print)).toBe(true);
    expect(stopVerdict(reviewed, "Done.", print).outcome).toBe("done");
    // new code with a fresh lint pass and review but only the old test pass: verifier wanted
    const p2 = basePrint && "p2";
    const edited = onReview(
      onCheck({ ...reviewed, lastEditAt: 8 }, true, 9, p2, "static"),
      gpt(p2, 9),
    );
    expect(
      verified(
        { ...edited, verifier: "pass", verifiedPrint: p2, lastVerifierAt: 9 },
        p2,
      ),
    ).toBe(true);
    expect(needsVerifier(edited, p2)).toBe(true);
    expect(stopVerdict(edited, "Done.", p2).block).toContain(
      "no passing test run",
    );
  });

  test(`heavy V2 without a test pass needs the verifier (${basePrint ?? "no git"})`, async () => {
    const lint = onReview(
      onCheck(
        {
          ...newTask(1, "heavy", basePrint),
          files: ["src/a.ts"],
          lastEditAt: 5,
        },
        true,
        6,
        print,
        "static",
      ),
      gpt(print, basePrint ? 6 : 7),
    );
    expect(needsVerifier(lint, print)).toBe(true);
    expect(stopVerdict(lint, "Done.", print).block).toContain(
      "no passing test run",
    );
    const done = onVerifier(lint, true, 8, print);
    expect(verified(done, print)).toBe(true);
    expect(verified(onVerifier(lint, false, 8, print), print)).toBe(false);
  });
}

test("heavy V2: a test failure equal to the baseline is no test pass", () => {
  const t = { ...newTask(1, "heavy", "p0"), files: ["src/a.ts"] };
  const base = onCheck(t, false, 1, "p0", "test", "FAIL x");
  const after = onCheck(
    { ...base, lastEditAt: 5 },
    false,
    6,
    "p1",
    "test",
    "FAIL x",
  );
  expect(after.passedPrints?.test).toBe("p1");
  expect(needsVerifier(onReview(after, gpt("p1")), "p1")).toBe(true);
});

test("heavy V2: no reviewer this round makes the verifier the second opinion", () => {
  const t = onCheck(
    { ...newTask(1, "heavy", "p0"), files: ["src/a.ts"], lastEditAt: 5 },
    true,
    6,
    "p1",
    "test",
  );
  const refused = onNoReviewer(t, "GPT has no room", "p1");
  expect(needsVerifier(refused, "p1")).toBe(true);
  expect(stopVerdict(refused, "Done.", "p1").block).toContain("no reviewer");
  expect(
    stopVerdict(onVerifier(refused, true, 7, "p1"), "Done.", "p1").outcome,
  ).toBe("pass-unverified"); // the review stays missing: no second hold, not "done"
  // the excuse belongs to its round: new code with its own test pass needs no verifier
  const next = onCheck({ ...refused, lastEditAt: 8 }, true, 9, "p2", "test");
  expect(needsVerifier(next, "p2")).toBe(false);
});

test("an old verifier PASS arriving after a newer FAIL does not clear it", () => {
  const t = onCheck(
    { ...newTask(1, "heavy", "p0"), files: ["src/a.ts"], lastEditAt: 5 },
    true,
    6,
    "p1",
    "test",
  );
  const failed = onVerifier(onReview(t, gpt("p1")), false, 8, "p1");
  const stale = onVerifier(failed, true, 7, "p0");
  expect(stale.verifier).toBe("fail");
  expect(needsVerifier(stale, "p1")).toBe(true);
  expect(verified(stale, "p1")).toBe(false);
  expect(verified(onVerifier(failed, true, 9, "p1"), "p1")).toBe(true);
});

test("a pass git could not fingerprint does not inherit a baseline run's print", () => {
  const t = { ...newTask(1, "heavy", "p0"), files: ["src/a.ts"] };
  const base = onCheck(t, false, 1, "p0", "test", "FAIL x");
  const same = onCheck(
    { ...base, lastEditAt: 5 },
    false,
    7,
    "p1",
    "test",
    "FAIL x",
  );
  const blind = onCheck(same, true, 6, undefined, "test");
  expect(blind.passedPrints?.test).toBe(undefined);
  expect(needsVerifier(onReview(blind, gpt("p1")), "p1")).toBe(true);
});

test("V3 always needs the verifier, on any track", () => {
  const t = onReview(
    onCheck(
      {
        ...newTask(1, "medium", "p0"),
        gateV: 3 as const,
        files: ["db/x.ts"],
        lastEditAt: 5,
      },
      true,
      6,
      "p1",
      "test",
    ),
    gpt("p1", 6, true),
  );
  expect(needsVerifier(t, "p1")).toBe(true);
  expect(stopVerdict(t, "Done.", "p1").block).toContain("V3");
  expect(verified(onVerifier(t, true, 7, "p1"), "p1")).toBe(true);
});

test("a failed verifier stays required until it passes, whatever the tier", () => {
  const light = onCheck(
    { ...newTask(1, "light", "p0"), files: ["src/a.ts"], lastEditAt: 5 },
    true,
    6,
    "p1",
    "test",
  );
  expect(needsVerifier(light, "p1")).toBe(false);
  const failed = onVerifier(light, false, 7, "p1");
  expect(needsVerifier(failed, "p1")).toBe(true);
  expect(stopVerdict(failed, "Done.", "p1").block).toContain(
    "reported failures",
  );
  expect(verified(onVerifier(failed, true, 8, "p1"), "p1")).toBe(true);
});

test("heavy work with a spec accepts the verifier's PASS and holds failures", async () => {
  const feature = onCheck(
    { ...newTask(1, "heavy", "p0"), lastEditAt: 5, spec: true, gptWrote: true },
    true,
    6,
    "p1",
    "static",
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
