import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
// `git`: the worktree as git shows it (a diff); absent, no git and flow goes by tool calls.
function world(
  on: On,
  store: Record<string, unknown> = {},
  git?: { diff: string },
) {
  let now = Date.parse("2026-10-27T12:00:00Z");
  on("session.id", async () => ({ value: "s1" }));
  on("clock.now", async () => ({ value: now }));
  on("clock.after", async () => ({ value: undefined }));
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.usage", async () => ({
    value: { context: { window: 200_000, percent: 10 }, rateLimits: [] },
  }));
  on("ui.log", async () => ({ value: undefined }));
  on("classic.Stop", async () => ({ value: {} }));
  on("ui.invalidate", async () => ({ value: undefined }));
  on("process.run", async (_$, e) => {
    const [cmd, sub] = e.argv;
    if (!git || cmd !== "git") return { value: { exitCode: 1, stdout: "", stderr: "" } };
    const stdout = sub === "diff" ? git.diff : git.diff ? " M src/a.ts\n" : "";
    return { value: { exitCode: 0, stdout, stderr: "" } };
  });
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("tool.call", { tool: ["Edit", "Write"] }, async (_$, e) => ({
    result: { type: "update" } as never,
    isError: (e as { file_path: string }).file_path.includes("broken"),
  }));
  on("tool.call", { tool: "Bash" }, async (_$, e) => ({
    result: { stdout: "", stderr: "" } as never,
    isError: e.command.includes("fail"),
  }));
  return { store, later: (ms: number) => (now += ms) };
}

type T$ = Parameters<Parameters<typeof test>[1]>[0];
const write = ($: T$, path: string) =>
  $.tool.call({ tool: "Write", file_path: path, content: "x" } as never);
const bash = ($: T$, command: string) =>
  $.tool.call({ tool: "Bash", command } as never);
const stop = async ($: T$, last = "Done.") =>
  (await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: last,
    background_tasks: [],
  } as never)) as { block?: string };

test("flow on holds a turn that ends with unchecked changes, once per round", async ($, on) => {
  const w = world(on, { flow: "on" });
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  expect((await stop($)).block).toContain(
    "src/a.ts changed after the last passing check",
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

test("observe holds nothing and logs the hold once per round", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  expect((await stop($)).block).toBe(undefined);
  expect((await stop($)).block).toBe(undefined);
  const log = (w.store.flowLog as { event: string }[]).map((e) => e.event);
  expect(log.filter((e) => e === "block").length).toBe(1);
  expect(log[0]).toBe("start");
});

test("a task growing past three files gets a note on the tool's result", async ($, on) => {
  world(on, { flow: "on" });
  for (const f of ["a", "b", "c"]) await write($, `/p/app/src/${f}.ts`);
  const fourth = (await write($, "/p/app/src/d.ts")) as { context?: string[] };
  expect(String(fourth.context)).toContain("grew from light to medium");
});

test("a turn ending on a question, or flow off, is never held", async ($, on) => {
  const w = world(on, { flow: "on" });
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  expect((await stop($, "Shall I add a test too?")).block).toBe(undefined);
  await $.command.run({ command: "flow", args: "off" } as never);
  expect(w.store.flow).toBe("off");
  expect((await stop($)).block).toBe(undefined);
});

test("with git, a change made through the shell is held until a check ran on it", async ($, on) => {
  const git = { diff: "" };
  const w = world(on, { flow: "on" }, git);
  expect((await stop($)).block).toBe(undefined); // a clean turn sets the baseline
  git.diff = "-a+b"; // sed -i, no Edit or Write call
  await bash($, "sed -i s/a/b/ src/a.ts");
  expect((await stop($)).block).toContain("Code changed after the last passing check");
  await bash($, "npm test 2>&1 | tail -5");
  expect((await stop($)).block).toBe(undefined);
  const log = (w.store.flowLog as { event: string; reason?: string }[]);
  expect(log[0]?.reason).toBe("changes git saw");
  expect(log.at(-1)?.event).toBe("end");
});

test("a failed edit is no change; the open task is kept per session", async ($, on) => {
  const w = world(on, { flow: "on" });
  await write($, "/p/app/src/broken.ts");
  expect((await stop($)).block).toBe(undefined);
  await write($, "/p/app/src/a.ts");
  const kept = w.store.flowTasks as Record<string, { files: string[] }>;
  expect(kept.s1?.files).toEqual(["/p/app/src/a.ts"]);
});

test("/flow mark puts the user's judgment on a pick", async ($, on) => {
  const w = world(on, { flow: "on" });
  await write($, "/p/app/src/a.ts");
  const out = await $.command.run({ command: "flow", args: "mark 1 too-light" } as never);
  expect(String((out as { text?: string }).text)).toContain("Marked 1 as too-light");
  const log = w.store.flowLog as { mark?: string }[];
  expect(log.at(-1)?.mark).toBe("too-light");
});
