import { expect, test } from "claude-code/testing";

import {
  CHECK_MS,
  FIX_ROUNDS,
  MAX_CHECKS,
  MAX_FINAL,
  MAX_RESULT,
  TAIL_LINES,
  TOTAL_MS,
  firstFailure,
  fixBrief,
  nextStep,
  readRunInput,
  resultText,
  tail,
  type CheckResult,
} from "./task-runner-policy";

const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
const failed: CheckResult = {
  argv: ["npm", "test", "--", "a b"],
  code: 1,
  output: lines.join("\n"),
};
const ok: CheckResult = { argv: ["npm", "run", "lint"], code: 0, output: "ok" };
const result = (over: Partial<Parameters<typeof resultText>[0]> = {}) =>
  resultText({
    status: "pass",
    model: "Sol 6.1",
    thread: "thread-1",
    rounds: 1,
    files: ["a.ts", "b.ts"],
    checks: [ok],
    final: "Built the change.",
    ...over,
  });

test("runner limits cover two repairs, bounded output and check deadlines", async () => {
  expect([FIX_ROUNDS, TAIL_LINES, MAX_RESULT, MAX_FINAL, MAX_CHECKS]).toEqual([
    2, 60, 4000, 1500, 3,
  ]);
  expect(CHECK_MS).toBe(10 * 60_000);
  expect(TOTAL_MS).toBe(30 * 60_000);
});

test("run input trims the brief, defaults the role and preserves argv literally", async () => {
  const checks = [["node", "-e", " console.log('a b') ", " "]];
  expect(readRunInput({ brief: "  Fix the bug.\n", checks })).toEqual({
    brief: "Fix the bug.",
    checks,
    role: "build",
  });
  expect(readRunInput({ brief: "Fix it.", checks, role: "build+" })).toEqual({
    brief: "Fix it.",
    checks,
    role: "build+",
  });
  expect(
    readRunInput({ brief: "Fix it.", checks: [ok.argv, ok.argv, ok.argv] }),
  ).toMatchObject({ role: "build" });
});

test("invalid input is not run and explains the brief, checks or role", async () => {
  expect(readRunInput({ brief: " \n", checks: [ok.argv] })).toBe(
    "Not run: the brief is empty.",
  );
  for (const checks of [
    undefined,
    [],
    [ok.argv, ok.argv, ok.argv, ok.argv],
    [["npm", 4]],
    [[]],
    [[""]],
    "npm test",
  ])
    expect(readRunInput({ brief: "Fix it.", checks })).toBe(
      "Not run: checks must be 1 to 3 commands, each an argv array of strings.",
    );
  for (const role of ["review", "", null, 1])
    expect(
      String(readRunInput({ brief: "Fix it.", checks: [ok.argv], role })),
    ).toContain("Not run: role must be build or build+.");
  for (const e of [null, undefined, 1, [], {}, { brief: 1 }])
    expect(String(readRunInput(e)).startsWith("Not run: ")).toBe(true);
});

test("tail keeps the last 60 lines after removing trailing blank lines", async () => {
  const last = lines.slice(40).join("\n");
  expect(tail(failed.output)).toBe(last);
  expect(tail(`${failed.output}\n\n  \n`)).toBe(last);
  expect(tail("one\r\ntwo\r\n\r\n", 1)).toBe("two");
  expect(tail("one\ntwo", 0)).toBe("");
  expect(tail("\n \n")).toBe("");
});

test("a fix brief names the failed check and its tail without weakening tests", async () => {
  const out = fixBrief(failed);
  expect(out).toContain("`npm test -- a b`");
  expect(out).toContain("exit 1");
  expect(out).toContain(`\`\`\`\n${lines.slice(40).join("\n")}\n\`\`\``);
  expect(out).not.toContain("line 40\n");
  expect(out).toContain("Fix the cause in the code");
  expect(out).toContain(
    "not by weakening, skipping or deleting the check or its tests",
  );
  expect(out).toContain("original brief");
  expect(fixBrief({ ...failed, code: null })).toContain("exit null");
});

test("next step passes all checks, repairs below the limit and then reports failing", async () => {
  const state = { checks: [ok], fixRounds: 0, overDeadline: false };
  expect(nextStep(state)).toBe("pass");
  expect(nextStep({ ...state, checks: [ok, failed], fixRounds: 1 })).toBe(
    "fix",
  );
  expect(nextStep({ ...state, checks: [failed], fixRounds: 2 })).toBe(
    "failing",
  );
  expect(nextStep({ ...state, checks: [{ ...failed, code: null }] })).toBe(
    "fix",
  );
  expect(firstFailure([ok, failed, { ...failed, code: 2 }])).toBe(failed);
  expect(firstFailure([ok])).toBe(undefined);
  expect(firstFailure([{ ...failed, code: null }])?.code).toBe(null);
});

test("check errors, the total deadline and Codex errors stop before pass or fix", async () => {
  const state = { checks: [ok], fixRounds: 0, overDeadline: false };
  expect(
    nextStep({ ...state, checks: [{ ...failed, error: "timed out" }] }),
  ).toBe("stopped");
  expect(
    nextStep({ ...state, checks: [{ ...ok, error: "could not start" }] }),
  ).toBe("stopped");
  expect(nextStep({ ...state, overDeadline: true })).toBe("stopped");
  expect(nextStep({ ...state, codexError: "Codex failed" })).toBe("stopped");
});

test("result lines keep status, model, thread, rounds, files and check exits in order", async () => {
  const out = result();
  expect(out.split("\n").slice(0, 3)).toEqual([
    "run_task pass · GPT Sol 6.1 · thread thread-1 · 1 rounds",
    "Changed: a.ts, b.ts",
    "check `npm run lint` → exit 0",
  ]);
  expect(out).toContain("--- final message ---\nBuilt the change.");
  expect(out.endsWith("Review the diff here before calling it done.")).toBe(
    true,
  );
  const empty = result({
    status: "not run",
    model: undefined,
    thread: undefined,
    rounds: 0,
    files: [],
    checks: [],
    final: "",
  });
  expect(empty.split("\n")[0]).toBe("run_task not run · 0 rounds");
  expect(empty).toContain("Changed: nothing");
  expect(empty).toContain("--- final message ---\n(empty)");
});

test("result caps the final at 1500 characters and adds a cut marker only when cut", async () => {
  const out = result({ final: "x".repeat(20_000) });
  expect(out).toContain(`${"x".repeat(1500)}\n[cut at 1500 characters]`);
  expect(out).not.toContain("x".repeat(1501));
  expect(result({ final: "x".repeat(1500) })).not.toContain("[cut at");
});

test("failing results retain the tail and explicit follow-up, never a passing status", async () => {
  const out = result({
    status: "failing",
    checks: [ok, failed],
    rounds: 3,
    verify: 2,
  });
  expect(out.split("\n")[0]).toBe(
    "run_task failing · GPT Sol 6.1 · thread thread-1 · 3 rounds",
  );
  expect(out.split("\n")[0]).not.toContain("pass");
  expect(out).toContain(`\`\`\`\n${lines.slice(40).join("\n")}\n\`\`\``);
  expect(out).toContain(
    "Never report this as passing: fix it here or hand a new brief with thread thread-1.",
  );
  expect(out).not.toContain("other-family review");
  expect(
    result({ status: "failing", thread: undefined, checks: [failed] }),
  ).toContain("Never report this as passing: fix it here or hand a new brief.");
});

test("huge failing output and final stay within 4000 with status and guidance intact", async () => {
  const out = result({
    status: "failing",
    checks: [{ ...failed, output: `${"x".repeat(20_000)}\nlast diagnostic` }],
    final: "y".repeat(20_000),
  });
  expect(out.length <= MAX_RESULT).toBe(true);
  expect(out.startsWith("run_task failing")).toBe(true);
  expect(out).toContain("last diagnostic\n```");
  expect(out).toContain("[cut at 1500 characters]");
  expect(out).toContain("Review the diff here before calling it done.");
  expect(out).toContain("Never report this as passing");
});

test("only passing V2+ results request an other-family review", async () => {
  const review =
    "Then get an other-family review: mcp__kit__delegate role review, author gpt.";
  expect(result({ verify: 2 })).toContain(review);
  expect(result({ verify: 3 })).toContain(review);
  expect(result({ verify: 1 })).not.toContain(review);
  expect(result({ status: "not run", verify: 2 })).not.toContain(review);
});

test("oversized metadata keeps check exits, status and review guidance within the cap", async () => {
  const out = result({
    status: "failing",
    files: ["a".repeat(20_000)],
    checks: [ok, failed].map((check) => ({
      ...check,
      argv: ["node", "x".repeat(20_000)],
    })),
    final: "y".repeat(20_000),
  });
  expect(out.length <= MAX_RESULT).toBe(true);
  expect(out.split("\n")[0]).toBe(
    "run_task failing · GPT Sol 6.1 · thread thread-1 · 1 rounds",
  );
  const checks = out.split("\n").filter((line) => line.startsWith("check `"));
  expect(checks[0]?.endsWith("` → exit 0")).toBe(true);
  expect(checks[1]?.endsWith("` → exit 1")).toBe(true);
  expect(out).toContain("Review the diff here before calling it done.");
  expect(out).toContain(
    "Never report this as passing: fix it here or hand a new brief with thread thread-1.",
  );
});

test("stopped results show the check error, stop reason and unfinished work", async () => {
  const out = result({
    status: "stopped",
    error: "check timed out",
    rounds: 2,
    checks: [{ ...failed, code: null, error: "timed out" }],
    verify: 2,
  });
  expect(out).toContain("check `npm test -- a b` → timed out");
  expect(out).toContain("Stopped: check timed out");
  expect(out.split("\n")[0]).not.toContain("pass");
  expect(out).toContain("Never report this as passing");
  expect(out).not.toContain("other-family review");
});
