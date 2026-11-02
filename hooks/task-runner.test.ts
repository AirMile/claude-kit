import { expect, test, type TestBody } from "claude-code/testing";
import { hashText } from "./flow-check";
import { world } from "./task-runner-fixture";
import { CHECK_MS, TOTAL_MS } from "./task-runner-policy";

type T$ = Parameters<TestBody>[0];
const ARGV = ["/check", "test", "a b; echo literal"];
const run = ($: T$, input: Record<string, unknown> = {}) =>
  $.tool.call({
    tool: "mcp__kit__run_task",
    brief: "Fix the form.",
    checks: [ARGV],
    ...input,
  } as never);

test("run_task passes once, runs argv without a shell at the root and reports files", async ($, on) => {
  const w = world(on);
  const out = String(
    (await run($, { checks: [ARGV, ["/lint"]], role: "build+" })).result,
  );
  expect(out).toContain("run_task pass");
  expect(out).toContain("1 rounds");
  expect(out).toContain("thread t-run");
  expect(out).toContain("Changed: src/r1.ts");
  expect(out).toContain("exit 0");
  expect(out.length <= 4000).toBe(true);
  expect(w.spawned.length).toBe(1);
  expect(w.spawned[0]?.input).toContain("Commit, push and deploy nothing");
  expect(w.checks).toEqual([
    { argv: ARGV, init: { cwd: "/p/app", timeoutMs: CHECK_MS } },
    { argv: ["/lint"], init: { cwd: "/p/app", timeoutMs: CHECK_MS } },
  ]);
  expect(w.notices.join("\n")).toContain("checks · round 1");
});

test("a failed check resumes the same thread with its argv and output tail, then checks all again", async ($, on) => {
  const w = world(on, { codes: [1, 0, 0, 0] });
  const out = String((await run($, { checks: [ARGV, ["/lint"]] })).result);
  expect(out).toContain("run_task pass");
  expect(out).toContain("2 rounds");
  expect(out).toContain("Changed: src/r1.ts, src/r2.ts");
  expect(w.spawned[1]?.argv.slice(1, 4)).toEqual(["exec", "resume", "t-run"]);
  const brief = w.spawned[1]?.input ?? "";
  expect(brief).toContain(ARGV.join(" "));
  expect(brief).toContain("line 64\nstderr tail");
  expect(brief).not.toContain("line 0\n");
  expect(brief).toContain("Commit, push and deploy nothing");
  expect(w.checks.map((c) => c.argv)).toEqual([
    ARGV,
    ["/lint"],
    ARGV,
    ["/lint"],
  ]);
});

test("two unsuccessful fix rounds return failing with the tail and never pass", async ($, on) => {
  const w = world(on, { codes: [1, 1, 1] });
  const out = String((await run($)).result);
  expect(out).toContain("run_task failing");
  expect(out).toContain("3 rounds");
  expect(out).toContain("line 64\nstderr tail");
  expect(out).not.toContain("run_task pass");
  expect(w.spawned.length).toBe(3);
  expect(w.checks.length).toBe(3);
});

test("a check's timeout is capped by the remaining total deadline", async ($, on) => {
  const w = world(on, { buildMs: TOTAL_MS - 1000, checkError: "timeout" });
  const out = String((await run($)).result);
  expect(out).toContain("run_task stopped");
  expect(out).toContain("round 1: timed out after 1000 ms");
  expect(w.checks[0]?.init?.timeoutMs).toBe(1000);
  expect(w.spawned.length).toBe(1);
});

for (const guard of ["brief", "checks", "off", "missing", "tight"] as const) {
  test(`run_task does not start: ${guard}`, async ($, on) => {
    const w = world(on, {
      off: guard === "off",
      missing: guard === "missing",
      claude: guard === "tight",
    });
    const out = String(
      (
        await run(
          $,
          guard === "brief"
            ? { brief: " " }
            : guard === "checks"
              ? { checks: [] }
              : {},
        )
      ).result,
    );
    expect(out).toContain("run_task not run");
    expect(out).toContain("Not run:");
    if (guard === "off") expect(out).toContain("GPT is off in the band");
    expect(w.spawned.length).toBe(0);
    expect(w.checks.length).toBe(0);
  });
}

for (const hold of ["root", "check"] as const)
  test(`the writer lock is shared with delegate during ${hold}`, async ($, on) => {
    const w = world(on, { hold });
    const first = run($);
    await w.entered;
    try {
      expect(String((await run($)).result)).toContain("run_task not run");
      const other = await $.tool.call({
        tool: "mcp__kit__delegate",
        role: "build",
        brief: "Edit.",
      } as never);
      expect(String(other.result)).toContain("another GPT run that writes");
      expect(w.spawned.length).toBe(hold === "root" ? 0 : 1);
    } finally {
      w.releaseRoot();
      await first;
    }
    expect(String((await run($)).result)).toContain("run_task pass");
  });

for (const failure of [
  "codex",
  "timeout",
  "start",
  "root",
  "deadline",
] as const) {
  test(`run_task stops on ${failure} and releases the writer lock`, async ($, on) => {
    const w = world(on, {
      failRound: failure === "codex" ? 2 : undefined,
      codes: failure === "codex" ? [1] : [],
      checkError:
        failure === "timeout"
          ? "timeout"
          : failure === "start"
            ? "start"
            : undefined,
      failRoot: failure === "root",
      buildMs: failure === "deadline" ? TOTAL_MS + 1 : 0,
    });
    const out = String((await run($)).result);
    expect(out).toContain("run_task stopped");
    if (failure === "codex") {
      expect(out).toContain("round 2: Codex offline");
      expect(out).toContain("src/r1.ts, src/r2.ts");
    }
    if (failure === "timeout")
      expect(out).toContain(`timed out after ${CHECK_MS}`);
    if (failure === "start") expect(out).toContain("could not start:");
    if (failure === "root")
      expect(out).toContain("no implementation for session.root");
    if (failure === "deadline") expect(w.checks.length).toBe(0);
    const next = String((await run($)).result);
    expect(next).not.toContain("run_task not run");
    expect(
      w.spawned.length > (failure === "root" ? 0 : failure === "codex" ? 2 : 1),
    ).toBe(true);
  });
}

test("flow records checks with their fingerprint and raises levels on the first failure", async ($, on) => {
  const w = world(on, { flow: true, codes: [1, 0] });
  const out = await run($, { checks: [["npx", "vitest", "run"]] });
  expect(String(out.context)).toContain("kit task: D1 E2 V2");
  expect(String(out.result)).toContain("author gpt");
  expect(w.store.flowTasks).toMatchObject({
    s1: {
      checks: 1,
      failed: 1,
      files: ["src/r1.ts", "src/r2.ts"],
      checkedPrint: hashText("src/a.ts\0blob-1"),
    },
  });
  expect(w.store.flowLog).toMatchObject([
    { event: "levels", text: "a failing check", levels: "D1 E2 V2" },
    { event: "delegate", text: "run_task", provider: "gpt", outcome: "ok" },
  ]);
});

for (const argv of [["true"], ["echo", "x; vitest"], ["/check", "test"]])
  test(`flow counts no check for \`${argv.join(" ")}\`, as for Bash`, async ($, on) => {
    const w = world(on, { flow: true });
    expect(String((await run($, { checks: [argv] })).result)).toContain(
      "run_task pass",
    );
    expect(w.checks.length).toBe(1);
    expect(w.store.flowTasks).toMatchObject({ s1: { checks: 0 } });
  });

test("a check that passes right at the total deadline still passes", async ($, on) => {
  const w = world(on, { buildMs: TOTAL_MS - 1000, checkMs: 1000 });
  expect(String((await run($)).result)).toContain("run_task pass");
  expect(w.checks.length).toBe(1);
});

test("the deadline between two checks stops the run; the skipped check never runs", async ($, on) => {
  const w = world(on, { buildMs: TOTAL_MS - 1000, checkMs: 1000 });
  const out = String((await run($, { checks: [ARGV, ["/lint"]] })).result);
  expect(out).toContain("run_task stopped");
  expect(out).toContain("round 1: total deadline reached");
  expect(out).not.toContain("run_task pass");
  expect(w.checks.length).toBe(1);
});

test("run_task stays visible and leaves permission checking to the normal prompt", async ($, on) => {
  world(on);
  on("tool.describe", { tool: "mcp__kit__run_task" }, async () => ({
    description: "Stable",
    isDeferred: true,
  }));
  on("tool.check", { tool: "mcp__kit__run_task" }, async () => ({
    decision: "ask" as const,
  }));
  const described = await $.tool.describe({
    tool: "mcp__kit__run_task",
    description: "Stable",
    isDeferred: true,
  } as never);
  expect(described).toEqual({ description: "Stable", isDeferred: false });
  const checked = await $.tool.check({
    tool: "mcp__kit__run_task",
    input: { brief: "Fix.", checks: [ARGV] },
  } as never);
  expect(checked.decision).toBe("ask");
});
