import { expect, test } from "claude-code/testing";

import { checkOf, checkPassed, hashText } from "./flow-check";
import { endEntry, keep, marked, notable, report } from "./flow-log";
import {
  CHANGE_LABELS,
  changeOfLabel,
  isSource,
  newTask,
  onCheck,
  onEdit,
  onPrompt,
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
  expect(ask({ change: "heavy" }).note).toContain("Commit or push nothing");
  expect(ask({ build: true, change: undefined }).task?.track).toBe("heavy");
  expect(ask({ kind: "question", change: undefined }).task).toBe(undefined);
  expect(ask({ kind: "planning", change: "none" }).note).toContain(
    "role research",
  );
  expect(ask({ change: "medium" }).note).toContain(
    "checks that cover the change",
  );
  expect(ask({ change: "medium" }).note).toContain(
    "A self-contained piece you can describe up front: hand it to mcp__kit__delegate (role build) and review its diff here.",
  );
  expect(changeOfLabel(CHANGE_LABELS.medium)).toBe("medium");
});

test("a reply, a question or an answer keeps the task; any other request starts afresh", async () => {
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
  // Unchecked work no longer swallows the next request: it ends and a new task starts.
  const next = ask({ task, change: "light", id: 2 });
  expect(next.event).toBe("start");
  expect(next.ended?.id).toBe(1);
  expect(next.task?.track).toBe("light");
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

test("edits grow the track at 4 and 9 files or on a migration; a spec marks the task", async () => {
  let t: Task | undefined;
  for (const f of ["a.ts", "b.ts", "c.ts"])
    t = onEdit(t, `src/${f}`, 1, 1, "p0")?.task;
  expect(t?.track).toBe("light"); // work outside a task starts a light one
  expect(t?.basePrint).toBe("p0");
  const four = onEdit(t, "src/d.ts", 2, 1, "p0");
  expect(four?.note).toContain("grew from light to medium");
  expect(onEdit(t, "db/migrations/001_users.sql", 2, 1, "p0")?.task.track).toBe(
    "heavy",
  );
  expect(onEdit(t, "docs/specs/login.md", 2, 1, "p0")?.task.spec).toBe(true);
  expect(onEdit(undefined, "docs/guide.md", 1, 1, "p0")).toBe(undefined);
  expect(isSource(".github/workflows/ci.yml")).toBe(true);
  expect(isSource("pages/intro.mdx")).toBe(true);
});

test("only real check runs count; a piped check passes only without failure words", async () => {
  expect(checkOf("npm test")).toEqual({ piped: false });
  expect(checkOf("cd app && pnpm run typecheck")).toEqual({ piped: false });
  expect(checkOf("npx -y -p typescript@5.6.3 tsc --noEmit -p .")).toBeTruthy();
  expect(checkOf("claude plugin test . 2>&1 | tail -3")).toEqual({
    piped: true,
  });
  expect(checkOf("CI=1 vitest run src/a.test.ts")).toBeTruthy();
  expect(checkOf("echo test")).toBe(undefined);
  expect(checkOf("cat src/foo.test.ts")).toBe(undefined);
  expect(checkOf("git commit -m 'test'")).toBe(undefined);
  expect(
    checkPassed({ piped: true }, false, "Tests: 2 failed, 10 passed"),
  ).toBe(false);
  expect(checkPassed({ piped: true }, false, " 0 fail\n 95 pass")).toBe(true);
  expect(checkPassed({ piped: false }, true, "")).toBe(false);
  expect(hashText("a")).not.toBe(hashText("b"));
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

test("the gate holds once per round and twice per task, never on a question", async () => {
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

test("heavy work with a spec needs the verifier's PASS; a Fix needs only its check", async () => {
  const fix: Task = {
    ...newTask(1, "heavy", "p0"),
    files: ["src/a.ts"],
    lastEditAt: 5,
  };
  expect(stopVerdict(onCheck(fix, true, 6, "p1"), "Done.", "p1").outcome).toBe(
    "done",
  );
  const feature = onCheck({ ...fix, spec: true }, true, 6, "p1");
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

test("the log keeps 14 days, records each task's end, and takes the user's marks", async () => {
  const day = 86_400_000;
  const t: Task = {
    ...onCheck(
      {
        ...newTask(1, "light"),
        first: "light",
        track: "medium",
        files: ["src/a.ts"],
      },
      true,
      1,
      undefined,
    ),
  };
  let log = keep([], {
    at: 0,
    event: "start",
    text: "add a button",
    track: "light",
    task: 1,
  });
  log = keep(log, endEntry(t, "verified", 2 * day));
  log = keep(log, {
    at: 15 * day,
    event: "start",
    text: "build the importer",
    track: "heavy",
    task: 2,
  });
  expect(log.length).toBe(2); // the first is older than 14 days
  expect(notable(log)[1]?.event).toBe("end");
  const m = marked(log, 2, "too-light");
  expect(m?.[0]?.mark).toBe("too-light");
  const out = report(m ?? []);
  expect(out).toContain("grew after the first pick (too light?): 1");
  expect(out).toContain("too-light 1");
  expect(
    report([
      { at: 1, event: "explore-note", text: "" },
      { at: 2, event: "read-note", text: "5 calls, 42 chars" },
      {
        at: 3,
        event: "delegate",
        text: "search",
        provider: "gpt",
        outcome: "ok",
      },
      {
        at: 4,
        event: "delegate",
        text: "research",
        provider: "claude",
        outcome: "ok",
      },
      {
        at: 5,
        event: "delegate",
        text: "build",
        provider: "none",
        outcome: "failed",
      },
      {
        at: 6,
        event: "delegate",
        text: "search",
        provider: "gpt",
        outcome: "failed",
      },
      {
        at: 7,
        event: "delegate",
        text: "build",
        provider: "none",
        outcome: "failed",
      },
    ]),
  ).toContain(
    "explore notes 1 · read notes 1 · delegated 2 (gpt 1, claude 1) · not delegated 2 · failed 1",
  );
  expect(out).toContain(
    "end medium (from light) · 1 files · 1 checks · verified: src/a.ts [too-light]",
  );
});
