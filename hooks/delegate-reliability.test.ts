import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

function world(
  on: On,
  opts: { dirty?: boolean; failRoot?: boolean; entries?: string } = {},
) {
  const store: Record<string, unknown> = {};
  let content = "before";
  let roots = 0;
  let spawned = 0;
  let releaseRoot!: () => void;
  let enteredRoot!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseRoot = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    enteredRoot = resolve;
  });
  const now = Date.parse("2026-10-27T12:00:00Z");
  on("clock.now", async () => ({ value: now }));
  on("session.id", async () => ({ value: "s1" }));
  on("session.root", async () => {
    roots++;
    if (roots === 1) {
      enteredRoot();
      await held;
      if (opts.failRoot) throw new Error("root unavailable");
    }
    return { value: "/p/app" };
  });
  on("session.usage", async () => ({ value: { rateLimits: [] } }));
  on("ui.log", async () => ({ value: undefined }));
  on("ui.notice", async () => ({ value: undefined }));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  const calls: string[][] = [];
  on("process.run", async (_$, e) => {
    calls.push([...e.argv]);
    const stdout =
      e.argv[0] === "node"
        ? JSON.stringify({
            argv: ["/bin/codex"],
            models: [{ id: "gpt-6.1-terra" }],
            limits: { five_hour: { pct: 1 }, seven_day: { pct: 1 } },
          })
        : e.argv[1] === "status"
          ? (opts.entries ??
            (opts.dirty || content === "after" ? " M src/a.ts\0" : ""))
          : e.argv[1] === "hash-object"
            ? e.argv
                .slice(3)
                .map(() => content)
                .join("\n") + "\n"
            : "";
    return { value: { exitCode: 0, stdout, stderr: "" } };
  });
  on("process.spawn", async function* () {
    spawned++;
    content = "after";
    yield {
      stream: "stdout" as const,
      text:
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "Done." },
        }) + "\n",
    };
    return { value: { code: 0, signal: null } };
  });
  return { entered, releaseRoot, store, calls, spawned: () => spawned };
}

type T$ = Parameters<Parameters<typeof test>[1]>[0];
const build = ($: T$) =>
  $.tool.call({
    tool: "mcp__kit__delegate",
    role: "build",
    brief: "Edit src/a.ts.",
  } as never);

test("a writer claims its slot before awaiting the root", async ($, on) => {
  const w = world(on);
  const first = build($);
  await w.entered;
  try {
    const second = await build($);
    expect(String(second.result)).toContain("Not started: another GPT run");
    expect(w.spawned()).toBe(0);
    expect(w.store.flowLog).toMatchObject([
      { event: "delegate", provider: "none", outcome: "failed", durationMs: 0 },
    ]);
  } finally {
    w.releaseRoot();
    await first;
  }
  expect(w.spawned()).toBe(1);
});

test("a root failure releases the writer slot", async ($, on) => {
  const w = world(on, { failRoot: true });
  const first = build($).catch(() => undefined);
  await w.entered;
  w.releaseRoot();
  await first;
  expect(String((await build($)).result)).toContain(" finished");
  expect(w.spawned()).toBe(1);
});

test("an already dirty file edited by Codex is listed and counted by flow", async ($, on) => {
  const w = world(on, { dirty: true });
  w.releaseRoot();
  expect(String((await build($)).result)).toContain("Changed: src/a.ts");
  expect(w.store.flowTasks).toMatchObject({ s1: { files: ["src/a.ts"] } });
  expect(w.calls.filter((argv) => argv[1] === "hash-object").length).toBe(2);
  expect(w.calls.every((argv) => !argv.includes("-w"))).toBe(true);
});

test("snapshots hash renamed destinations and untracked files, and mark deletions", async ($, on) => {
  const w = world(on, {
    entries: "R  src/new name.ts\0src/old.ts\0?? new/file.ts\0 D gone.ts\0",
  });
  w.releaseRoot();
  const out = String((await build($)).result);
  expect(out).toContain("Changed: src/new name.ts, new/file.ts");
  expect(out).not.toContain("gone.ts"); // unchanged deletion marker
  const hashes = w.calls.filter((argv) => argv[1] === "hash-object");
  expect(hashes[0]).toEqual([
    "git",
    "hash-object",
    "--",
    "src/new name.ts",
    "new/file.ts",
  ]);
  expect(hashes[1]).toEqual(hashes[0]);
});
