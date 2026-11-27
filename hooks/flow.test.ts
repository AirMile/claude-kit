import { expect, test } from "claude-code/testing";

import { commitBlock } from "./commit-gate-policy";
import { CHANGE_LABELS, newTask, type Task } from "./flow-policy";
import { LABELS } from "./model-policy";
import { VERIFY_LABELS } from "./task-policy";

import { world, write, bash, stop } from "./flow-fixture";
import { world as runnerWorld } from "./task-runner-fixture";
import { labelAnswer } from "./label-fixture";

test("flow holds a turn that ends with unchecked changes, once per round", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  expect((await stop($)).block).toContain(
    "src/a.ts changed and no command this task was recognised as a check",
  );
  expect((await stop($)).block).toBe(undefined); // the same round: let through
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  await bash($, "npm test");
  w.later(1000);
  expect((await stop($)).block).toBe(undefined); // checked after the change
  const out = await $.command.run({ command: "flow", args: "" } as never);
  expect(String((out as { text?: string }).text)).toContain("holds 1");
});

test("a task growing past three files gets a note on the tool's result", async ($, on) => {
  world(on);
  for (const f of ["a", "b", "c"]) await write($, `/p/app/src/${f}.ts`);
  const fourth = (await write($, "/p/app/src/d.ts")) as { context?: string[] };
  expect(String(fourth.context)).toContain("grew from light to medium");
});

test("a turn ending on a question is never held", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  expect((await stop($, "Shall I add a test too?")).block).toBe(undefined);
});

test("with git, a change made through the shell is held until a check ran on it", async ($, on) => {
  const git = { index: "a1", work: "a1" };
  const w = world(on, {}, git);
  expect((await stop($)).block).toBe(undefined); // a clean turn sets the baseline
  git.work = "b2"; // sed -i, no Edit or Write call
  await bash($, "sed -i s/a/b/ src/a.ts");
  expect((await stop($)).block).toContain(
    "Code changed and no command this task was recognised as a check",
  );
  await bash($, "set -o pipefail; npm test 2>&1 | tail -5");
  expect((await stop($)).block).toBe(undefined);
  const log = w.store.flowLog as { event: string; reason?: string }[];
  expect(log[0]?.reason).toBe("changes git saw");
  expect(log.at(-1)?.event).toBe("end");
});

test("a failed edit is no change; the open task is kept per session", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/broken.ts");
  expect((await stop($)).block).toBe(undefined);
  await write($, "/p/app/src/a.ts");
  const kept = w.store.flowTasks as Record<string, { files: string[] }>;
  expect(kept.s1?.files).toEqual(["/p/app/src/a.ts"]);
});

test("/flow mark puts the user's judgment on a pick", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/a.ts");
  const out = await $.command.run({
    command: "flow",
    args: "mark 1 too-light",
  } as never);
  expect(String((out as { text?: string }).text)).toContain(
    "Marked 1 as too-light",
  );
  const log = w.store.flowLog as { mark?: string }[];
  expect(log.at(-1)?.mark).toBe("too-light");
});

test("a commit after the passing check is no change: the turn ends", async ($, on) => {
  const git = { index: "a1", work: "a1" };
  world(on, {}, git);
  expect((await stop($)).block).toBe(undefined);
  git.work = "b2";
  await write($, "/p/app/src/a.ts");
  await bash($, "npm test");
  git.index = "b2"; // git commit -am
  await bash($, "git commit -am 'fix: b'");
  expect((await stop($)).block).toBe(undefined);
});

test("a thin reply keeps the task's levels; growth and the first failing check raise E and V", async ($, on) => {
  const w = world(on, { mode: "off" });
  const sent: (readonly string[] | undefined)[] = [];
  on("model.classify", async () => ({ value: LABELS.routine }));
  on("model.complete", async (_$, e) =>
    labelAnswer(e.prompt, {
      change: CHANGE_LABELS.light,
      verify: VERIFY_LABELS.behaviour,
    }),
  );
  on("prompt.submit", async (_$, e) => {
    sent.push(e.context);
    return { text: e.text };
  });
  const levels = () =>
    (w.store.flowLog as { event: string; levels?: string; text: string }[])
      .filter((e) => e.levels)
      .map((e) => `${e.event} ${e.levels}`);
  const ask = (text: string) =>
    $.prompt.submit({ text, origin: { kind: "composer" } });
  await ask("Change the retry handling in src/a.ts");
  expect(String(sent[0])).toContain("kit task: D1 E1 V1.");
  await ask("ja");
  expect(String(sent[1] ?? "")).not.toContain("kit task");
  const failed = (await bash($, "npm test fail")) as { context?: string[] };
  expect(String(failed.context)).toContain("kit task: D1 E2 V2.");
  await bash($, "npm test fail"); // the same work: no second raise
  expect(levels()).toEqual(["decision D1 E1 V1", "levels D1 E2 V2"]);
  for (const f of ["a", "b", "c"]) await write($, `/p/app/src/${f}.ts`);
  const grown = (await write($, "/p/app/src/d.ts")) as { context?: string[] };
  expect(String(grown.context)).toContain("grew from light to medium");
  expect(String(grown.context)).toContain("kit task: D1 E3 V3.");
  expect(levels().at(-1)).toBe("levels D1 E3 V3");
  const out = await $.command.run({ command: "flow", args: "" } as never);
  expect(String((out as { text?: string }).text)).toContain(
    "E1+ decisions with a GPT run: 0 of 1",
  );
});

test("an answer that grows the task raises E and V; one that raises nothing gets no note; /task-readiness still asks for verify need", async ($, on) => {
  world(on, { mode: "off" });
  const sent: (readonly string[] | undefined)[] = [];
  let change = CHANGE_LABELS.light;
  let verify = VERIFY_LABELS.behaviour;
  on("model.classify", async () => ({ value: LABELS.routine }));
  on("model.complete", async (_$, e) =>
    labelAnswer(e.prompt, { change, verify }),
  );
  on("prompt.submit", async (_$, e) => {
    sent.push(e.context);
    return { text: e.text };
  });
  const ask = (text: string) =>
    $.prompt.submit({ text, origin: { kind: "composer" } });
  await ask("Change the retry handling in src/a.ts");
  expect(String(sent.at(-1))).toContain("kit task: D1 E1 V1.");
  await stop($, "Shall I make the timeout configurable too?");
  change = CHANGE_LABELS.medium;
  await ask("Yes, and pass it through every module that retries");
  expect(String(sent.at(-1))).toContain("grew from light to medium");
  expect(String(sent.at(-1))).toContain("kit task: D1 E2 V2.");
  await stop($, "Anything else?");
  change = CHANGE_LABELS.light;
  await ask("No, keep the default at three retries");
  expect(String(sent.at(-1) ?? "")).not.toContain("kit task");
  await stop($, "Done.");
  change = CHANGE_LABELS.heavy;
  verify = VERIFY_LABELS.risky;
  await ask("/kit:task-readiness auth-migration");
  expect(String(sent.at(-1))).toContain("kit task: D2 E2 V3.");
});

test("Bash keeps failed tests open after lint and closes them after tests", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  await bash($, "npm test fail");
  await bash($, "npm run lint");
  expect(w.store.flowTasks).toMatchObject({ s1: { openKinds: ["test"] } });
  expect((await stop($)).block).toContain("tests failed earlier");
  w.later(1000);
  await bash($, "npm test");
  expect(w.store.flowTasks).toMatchObject({ s1: { openKinds: [] } });
});

test("stored open kinds reload and /clear removes them from the next task", async ($, on) => {
  const stored = JSON.parse(
    JSON.stringify({
      s1: {
        ...newTask(1, "light"),
        lastEditAt: 1,
        openKinds: ["test", "build"],
      },
    }),
  );
  const w = world(on, { flowTasks: stored });
  on("session.end", async () => ({ sessionId: "s1" }));
  await bash($, "npm run lint");
  expect(w.store.flowTasks).toMatchObject({
    s1: { openKinds: ["test", "build"] },
  });
  const out = await $.command.run({ command: "flow", args: "" } as never);
  expect(String((out as { text?: string }).text)).toContain(
    "tests failed earlier",
  );
  await $.session.end({ reason: "clear" } as never);
  expect(w.store.flowTasks).toEqual({});
  await write($, "/p/app/src/b.ts");
  expect(w.store.flowTasks).toMatchObject({ s1: { openKinds: [] } });
});

test("run_task records the same check kinds as Bash", async ($, on) => {
  const w = runnerWorld(on, { flow: true, codes: [1, 0, 1, 0, 1, 0] });
  await $.tool.call({
    tool: "mcp__kit__run_task",
    family: "terra",
    brief: "Fix the form.",
    checks: [
      ["ng", "test"],
      ["ng", "lint"],
    ],
  } as never);
  expect(w.store.flowTasks).toMatchObject({
    s1: {
      openKinds: ["test"],
      failed: 3,
      checks: 3,
    },
  });
});

test("AGENTS.md § Commands makes every listed kind required for a medium task", async ($, on) => {
  const w = world(on);
  on("fs.read", async (_$, e) => {
    if (!e.path.endsWith("/AGENTS.md")) throw new Error("missing");
    return {
      value: "## Commands\n\n- Test: `npm test`\n- Lint: `npm run lint`\n",
    };
  });
  for (const f of ["a", "b", "c", "d"]) await write($, `/p/app/src/${f}.ts`);
  w.later(1000);
  await bash($, "npm run lint");
  w.later(1000);
  expect((await stop($)).block).toContain("a passing test run");
  await write($, "/p/app/src/e.ts");
  w.later(1000);
  await bash($, "npm run lint && npm test");
  w.later(1000);
  expect((await stop($)).block).toBe(undefined);
});

test("a hold for another folder's change names the session root's AGENTS.md", async ($, on) => {
  const w = world(on);
  on("fs.read", async (_$, e) => {
    if (e.path !== "/p/app/AGENTS.md") throw new Error("missing");
    return {
      value: "## Commands\n\n- Test: `npm test`\n- Lint: `npm run lint`\n",
    };
  });
  for (const f of ["a", "b", "c", "d"]) await write($, `/p/kit/src/${f}.ts`);
  w.later(1000);
  await bash($, "npm run lint");
  w.later(1000);
  expect((await stop($)).block).toContain("(/p/app/AGENTS.md lists it)");
});

const statusWorld = (on: Parameters<typeof world>[0], out: string) =>
  world(on, {}, undefined, (command) => (command.includes("echo") ? out : ""));
const SUITE = "node --test test/*.test.mjs > f.log 2>&1; echo exit=$?";

test("a failing suite behind a status echo opens the kind and blocks a commit", async ($, on) => {
  const w = statusWorld(on, "exit=1\n");
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  await bash($, SUITE);
  expect(w.store.flowTasks).toMatchObject({ s1: { openKinds: ["test"] } });
  expect((await stop($)).block).toContain("tests failed earlier");
});

test("the status line is the last line: '# fail 0' then exit=1 opens the kind", async ($, on) => {
  const w = statusWorld(on, "# fail 0\nexit=1\n");
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  await bash($, SUITE);
  expect(w.store.flowTasks).toMatchObject({ s1: { openKinds: ["test"] } });
});

test("a passing suite behind a status echo is recorded", async ($, on) => {
  const w = statusWorld(on, "exit=0\n");
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  await bash($, SUITE);
  expect(w.store.flowTasks).toMatchObject({ s1: { openKinds: [], checks: 1 } });
  expect((await stop($)).block).toBe(undefined);
});

test("a masked or never-run suite credits nothing", async ($, on) => {
  const w = statusWorld(on, "exit=0\n");
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  await bash($, "true || node --test");
  await bash($, "node --test || true");
  await bash($, "node --test; echo done");
  expect(w.store.flowTasks).toMatchObject({ s1: { openKinds: [], checks: 0 } });
  expect((await stop($)).block).toContain(
    "changed after the last passing check",
  );
});

test("an unchanged print stays passing; a log file written in the repo reopens the work", async ($, on) => {
  const git = { index: "a1", work: "a1", fresh: "" };
  const w = world(on, {}, git);
  await stop($); // a clean turn sets the baseline
  git.work = "b2";
  await bash($, "sed -i s/a/b/ src/a.ts");
  expect((await stop($)).block).toContain(
    "no command this task was recognised as a check",
  );
  await bash($, "npm test");
  w.later(1000);
  expect((await stop($)).block).toBe(undefined); // checked on this very code
  expect((await stop($)).block).toBe(undefined); // and still, with the same print
  git.fresh = "f.log"; // the suite's own log: a new, non-ignored file
  w.later(1000);
  // the verified task ended: this is a new task, and it has seen no check yet
  expect((await stop($)).block).toContain(
    "no command this task was recognised as a check",
  );
});

for (const [status, denied] of [
  ["exit=1", true],
  ["exit=0", false],
] as const)
  test(`commitBlock on the task the Bash hook recorded: ${status} ${denied ? "denies" : "clears"} the commit`, async ($, on) => {
    const w = statusWorld(on, `${status}\n`);
    await write($, "/p/app/src/a.ts");
    w.later(1000);
    await bash($, SUITE);
    const task = (w.store.flowTasks as Record<string, Task>).s1;
    const block = commitBlock({ ...task, track: "medium" }, undefined);
    if (denied) expect(block).toContain("tests failed earlier");
    else expect(block).toBeUndefined();
  });

test("Bash calls that are not checks are counted; a recognised one, even masked, is counted apart", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  await bash($, "ls src");
  await bash($, "git status");
  expect(w.store.flowTasks).toMatchObject({ s1: { shellCalls: 2 } });
  expect((await stop($)).block).toContain("2 shell commands ran, none a check");
  await bash($, "npm test");
  expect(w.store.flowTasks).toMatchObject({
    s1: { shellCalls: 2, checkCalls: 1 },
  });
});

test("the log notes the context at a task's first edit, first passing check and end", async ($, on) => {
  const w = world(on, {}, undefined, () => "", 84_000);
  await write($, "/p/app/src/a.ts");
  await write($, "/p/app/src/b.ts"); // a second edit: no second entry
  w.later(1_000);
  await bash($, "npm test -- --fail");
  await bash($, "npm test");
  await bash($, "npm test");
  const log = (w.store.flowLog ?? []) as { event: string; text: string; ctx?: number }[];
  expect(log.filter((e) => e.event === "ctx").map((e) => [e.text, e.ctx])).toEqual([
    ["first edit", 84_000],
    ["first pass", 84_000],
  ]);
  expect((await stop($)).block).toBe(undefined);
  const end = ((w.store.flowLog ?? []) as typeof log).find((e) => e.event === "end");
  expect(end?.ctx).toBe(84_000);
});

test("an unreadable store is not an empty one: no task forgotten, no other session wiped", async ($, on) => {
  const tasks = JSON.parse(
    JSON.stringify({
      s2: { ...newTask(2, "light"), lastEditAt: 2 },
      s1: { ...newTask(1, "light"), lastEditAt: 1, openKinds: ["test"] },
    }),
  );
  let broken = true;
  const store: Record<string, unknown> = {};
  Object.defineProperty(store, "flowTasks", {
    enumerable: true,
    get() {
      if (broken) throw new Error("store unreadable");
      return tasks;
    },
    set(v) {
      Object.assign(tasks, v);
      for (const k of Object.keys(tasks)) if (!(k in v)) delete tasks[k];
    },
  });
  world(on, store);
  await bash($, "npm run lint");
  await write($, "/p/app/src/b.ts");
  expect(Object.keys(tasks).sort()).toEqual(["s1", "s2"]);
  broken = false;
  expect((await stop($)).block).toContain("tests failed earlier");
  expect(Object.keys(tasks).sort()).toEqual(["s1", "s2"]);
});

test("a store that fails only now and then never lets a partial task replace the stored one", async ($, on) => {
  const tasks = JSON.parse(
    JSON.stringify({
      s1: { ...newTask(1, "light"), lastEditAt: 1, openKinds: ["build"] },
    }),
  );
  let reads = 0;
  const store: Record<string, unknown> = {};
  Object.defineProperty(store, "flowTasks", {
    enumerable: true,
    get() {
      reads += 1;
      if (reads === 1) throw new Error("store unreadable"); // the load fails, the save's read works
      return tasks;
    },
    set(v) {
            Object.assign(tasks, v);
    },
  });
  world(on, store);
  await write($, "/p/app/src/b.ts");
  expect(tasks.s1.openKinds).toEqual(["build"]);
  expect((await stop($)).block).toContain("build failed earlier");
  expect(tasks.s1.files).toContain("/p/app/src/b.ts");
});

test("edits while the store was unreadable count with the stored ones toward the track", async ($, on) => {
  const tasks = JSON.parse(
    JSON.stringify({
      s1: {
        ...newTask(1, "light"),
        lastEditAt: 1,
        files: ["/p/app/src/a.ts", "/p/app/src/b.ts"],
        levels: { d: 1, e: 1, v: 1, r: 0 },
      },
    }),
  );
  let broken = true;
  const store: Record<string, unknown> = {};
  Object.defineProperty(store, "flowTasks", {
    enumerable: true,
    get() {
      if (broken) throw new Error("store unreadable");
      return tasks;
    },
    set(v) {
      Object.assign(tasks, v);
    },
  });
  world(on, store);
  // Four edits make the task in memory medium on its own, as the stored one grows too.
  for (const f of ["c", "d", "e", "f"]) await write($, `/p/app/src/${f}.ts`);
  broken = false;
  await stop($);
  expect(tasks.s1.files.length).toBe(6);
  expect(tasks.s1.track).toBe("medium");
  expect(tasks.s1.gateV).toBe(2); // the growth raises Verify, as it does with a readable store

});

test("an outage that passes two tracks raises Verify twice", async ($, on) => {
  const tasks = JSON.parse(
    JSON.stringify({
      s1: {
        ...newTask(1, "light"),
        lastEditAt: 1,
        files: ["/p/app/src/a.ts", "/p/app/src/b.ts"],
        levels: { d: 1, e: 1, v: 1, r: 0 },
      },
    }),
  );
  let broken = true;
  const store: Record<string, unknown> = {};
  Object.defineProperty(store, "flowTasks", {
    enumerable: true,
    get() {
      if (broken) throw new Error("store unreadable");
      return tasks;
    },
    set(v) {
      Object.assign(tasks, v);
    },
  });
  world(on, store);
  // Four edits make the task in memory medium on its own, as the stored one grows too.
  for (const f of ["c", "d", "e", "f", "g", "h", "i"]) await write($, `/p/app/src/${f}.ts`);
  broken = false;
  await stop($);
  expect(tasks.s1.files.length).toBe(9);
  expect(tasks.s1.track).toBe("heavy");
  expect(tasks.s1.gateV).toBe(3); // the growth raises Verify, as it does with a readable store

});

test("a readiness block written while the store was unreadable goes on the stored task", async ($, on) => {
  const BLOCK = "Goal: x\nSize: 1 file\nOpen: none";
  const tasks = JSON.parse(
    JSON.stringify({ s1: { ...newTask(1, "light"), lastEditAt: 1, readiness: "Goal: old\nOpen: none" } }),
  );
  let broken = true;
  const store: Record<string, unknown> = {};
  Object.defineProperty(store, "flowTasks", {
    enumerable: true,
    get() {
      if (broken) throw new Error("store unreadable");
      return tasks;
    },
    set(v) {
      Object.assign(tasks, v);
    },
  });
  world(on, store);
  let said = [
    { role: "user", text: "bouw", toolUses: [] },
    { role: "assistant", text: BLOCK, toolUses: [] },
  ];
  on("session.messages", async () => ({ value: said }));
  await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: "Server runs.",
    background_tasks: [{ id: "b1" }],
  } as never);
  broken = false;
  // The next turn has no block of its own.
  said = [{ role: "user", text: "verder", toolUses: [] }];
  await write($, "/p/app/src/a.ts");
  await stop($);
  expect(tasks.s1.readiness).toBe(BLOCK);
});

test("a block an ordinary Stop writes while the store is unreadable goes on the stored task", async ($, on) => {
  const BLOCK = "Goal: x\nSize: 1 file\nOpen: none";
  const tasks = JSON.parse(
    JSON.stringify({ s1: { ...newTask(1, "light"), lastEditAt: 1, readiness: "Goal: old\nOpen: none" } }),
  );
  let broken = true;
  const store: Record<string, unknown> = {};
  Object.defineProperty(store, "flowTasks", {
    enumerable: true,
    get() {
      if (broken) throw new Error("store unreadable");
      return tasks;
    },
    set(v) {
      Object.assign(tasks, v);
    },
  });
  world(on, store);
  let said = [
    { role: "user", text: "bouw", toolUses: [] },
    { role: "assistant", text: BLOCK, toolUses: [] },
  ];
  on("session.messages", async () => ({ value: said }));
  await stop($);
  broken = false;
  // The next turn has no block of its own.
  said = [{ role: "user", text: "verder", toolUses: [] }];
  await write($, "/p/app/src/a.ts");
  await stop($);
  expect(tasks.s1.readiness).toBe(BLOCK);
});

test("with no stored task, a block written during the outage goes to the task the go-ahead opens", async ($, on) => {
  const BLOCK = "Goal: x\nSize: 1 file\nOpen: none";
  const tasks = JSON.parse(
    JSON.stringify({}),
  );
  let broken = true;
  const store: Record<string, unknown> = {};
  Object.defineProperty(store, "flowTasks", {
    enumerable: true,
    get() {
      if (broken) throw new Error("store unreadable");
      return tasks;
    },
    set(v) {
      Object.assign(tasks, v);
    },
  });
  world(on, store);
  let said = [
    { role: "user", text: "bouw", toolUses: [] },
    { role: "assistant", text: BLOCK, toolUses: [] },
  ];
  on("session.messages", async () => ({ value: said }));
  await stop($);
  broken = false;
  // The next turn has no block of its own.
  said = [{ role: "user", text: "verder", toolUses: [] }];
  await write($, "/p/app/src/a.ts");
  await stop($);
  expect(tasks.s1.readiness).toBe(BLOCK);
});

test("a block buffered during the outage never overwrites a newer one written then", async ($, on) => {
  const A = "Goal: a\nSize: 1 file\nOpen: none";
  const B = "Goal: b\nSize: 1 file\nOpen: none";
  const tasks = JSON.parse(JSON.stringify({ s1: { ...newTask(1, "light"), lastEditAt: 1 } }));
  let broken = true;
  const store: Record<string, unknown> = {};
  Object.defineProperty(store, "flowTasks", {
    enumerable: true,
    get() {
      if (broken) throw new Error("store unreadable");
      return tasks;
    },
    set(v) {
      Object.assign(tasks, v);
    },
  });
  world(on, store);
  let said = [
    { role: "user", text: "bouw", toolUses: [] },
    { role: "assistant", text: A, toolUses: [] },
  ];
  on("session.messages", async () => ({ value: said }));
  await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: "Server runs.",
    background_tasks: [{ id: "b1" }],
  } as never);
  said = [
    { role: "user", text: "verder", toolUses: [] },
    { role: "assistant", text: B, toolUses: [] },
  ];
  await write($, "/p/app/src/a.ts");
  await stop($); // still unreadable: B goes on the task in memory
  broken = false;
  said = [{ role: "user", text: "nog iets", toolUses: [] }];
  await write($, "/p/app/src/b.ts");
  await stop($);
  expect(tasks.s1.readiness).toBe(B);
});
