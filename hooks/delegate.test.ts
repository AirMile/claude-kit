import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
const NOW = Date.parse("2026-10-27T12:00:00Z");
const later = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const CATALOG = [
  "gpt-6.1-sol",
  "gpt-6-astra",
  "gpt-6.1-terra",
  "gpt-6-luna",
  "gpt-5.6-terra",
];

function world(
  on: On,
  opts: {
    store?: Record<string, unknown>;
    status?: Record<string, unknown>; // what codex-status.js prints
    events?: string[]; // what Codex writes on stdout
  } = {},
) {
  const spawned: { argv: readonly string[]; input?: string }[] = [];
  const store: Record<string, unknown> = { ...opts.store };
  let gitCalls = 0;
  let statusReads = 0;
  on("session.root", async () => ({ value: "/p/app" }));
  on("ui.notice", async () => ({ value: undefined }));
  on("clock.now", async () => ({ value: NOW }));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("session.usage", async () => ({
    value: {
      context: { window: 200_000, percent: 10 },
      rateLimits: [{ kind: "five_hour", percentUsed: 20, resetsAt: later(3) }],
    },
  }));
  on("process.run", async (_$, e) => {
    if (e.argv[0] === "node") {
      statusReads++;
      const status = opts.status ?? {
        argv: ["/bin/codex"],
        models: CATALOG.map((id) => ({ id })),
        limits: {
          five_hour: { pct: 1, resetsAt: later(4) },
          seven_day: { pct: 6, resetsAt: later(100) },
        },
      };
      return {
        value: {
          exitCode: 0,
          stdout: `${JSON.stringify(status)}\n`,
          stderr: "",
        },
      };
    }
    gitCalls++; // git status: clean before the run, one file after
    return {
      value: {
        exitCode: 0,
        stdout: gitCalls > 1 ? " M src/a.ts\n" : "",
        stderr: "",
      },
    };
  });
  on("process.spawn", async function* (_$, e) {
    spawned.push({ argv: e.argv, input: e.input });
    for (const line of opts.events ?? [])
      yield { stream: "stdout" as const, text: `${line}\n` };
    return { value: { code: 0, signal: null } };
  });
  return { spawned, store, reads: () => statusReads };
}

const EVENTS = [
  JSON.stringify({ type: "thread.started", thread_id: "t-123" }),
  JSON.stringify({
    type: "item.completed",
    item: { type: "command_execution" },
  }),
  JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: "Added the button; npm test passes." },
  }),
  JSON.stringify({
    type: "turn.completed",
    usage: { input_tokens: 1000, output_tokens: 50 },
  }),
];

async function delegate(
  $: Parameters<Parameters<typeof test>[1]>[0],
  input: Record<string, unknown>,
) {
  const ran = await $.tool.call({
    tool: "mcp__kit__delegate",
    ...input,
  } as never);
  return String((ran as { result?: unknown }).result ?? JSON.stringify(ran));
}

test("with room on both, a build runs on the newest Terra and only its final message comes back", async ($, on) => {
  const w = world(on, { events: EVENTS });
  const out = await delegate($, {
    role: "build",
    brief: "Add a submit button to the form.",
  });
  const argv = w.spawned[0]?.argv ?? [];
  expect(argv.slice(0, 2)).toEqual(["/bin/codex", "exec"]);
  expect(argv).toContain("gpt-6.1-terra");
  expect(argv).toContain("workspace-write");
  expect(argv).not.toContain("--ephemeral");
  expect(w.spawned[0]?.input).toContain("Commit, push and deploy nothing");
  expect(out).toContain(
    "GPT Terra 6.1 (build, workspace-write, effort medium) finished · 1 commands · thread t-123",
  );
  expect(out).toContain("Changed: src/a.ts");
  expect(out).toContain("Added the button; npm test passes.");
});

test("a search runs on Luna when ChatGPT has room", async ($, on) => {
  const w = world(on, { events: EVENTS });
  const out = await delegate($, {
    role: "search",
    brief: "Find where the form is submitted.",
  });
  expect(w.spawned[0]?.argv).toContain("gpt-6-luna");
  expect(w.spawned[0]?.argv).toContain("read-only");
  expect(out).toContain("GPT Luna 6 (search");
  expect(w.store.flowLog).toMatchObject([
    { event: "delegate", text: "search gpt" },
  ]);
});

test("a family asked for by name runs on it; a thread continues the earlier run", async ($, on) => {
  const w = world(on, { events: EVENTS });
  await delegate($, {
    role: "plan",
    brief: "Plan the importer.",
    family: "astra",
  });
  expect(w.spawned[0]?.argv).toContain("gpt-6-astra");
  expect(w.spawned[0]?.argv).toContain("read-only");
  await delegate($, {
    role: "research",
    brief: "And the retries?",
    thread: "t-123",
  });
  expect(w.spawned[1]?.argv.slice(1, 4)).toEqual(["exec", "resume", "t-123"]);
});

test("a review runs read-only with the brief and asks for ranked findings", async ($, on) => {
  const w = world(on, { events: EVENTS });
  await delegate($, {
    role: "review",
    brief: "Review the form change.",
    author: "claude",
  });
  const argv = w.spawned[0]?.argv ?? [];
  expect(argv.slice(1, 3)).toEqual(["exec", "--json"]);
  expect(argv).toContain("read-only");
  expect(argv).toContain("gpt-6.1-sol");
  expect(w.spawned[0]?.input).toContain("Review the form change.");
  expect(w.spawned[0]?.input).toContain("[P0] to [P3]");
});

test("without Codex a change is built here and research goes to Claude, saying why", async ($, on) => {
  const w = world(on, {
    status: { argv: null, models: [], limits: {}, error: "codex not found" },
  });
  const out = await delegate($, {
    role: "build",
    brief: "Add a submit button.",
  });
  expect(w.spawned.length).toBe(0);
  expect(out).toBe(
    "Not delegated: Codex is not available here: build it here.",
  );
  const read = await delegate($, {
    role: "research",
    brief: "Weigh the retry options.",
  });
  expect(read).toContain("Route: Claude (Codex: codex not found)");
  expect(read).toContain('model "sonnet"');
  expect(w.store.flowLog).toMatchObject([
    { event: "delegate", text: "build none" },
    { event: "delegate", text: "research claude" },
  ]);
});

test("/gpt shows the newest model per family and pins one", async ($, on) => {
  const w = world(on);
  const shown = await $.command.run({ command: "gpt", args: "" } as never);
  expect(String((shown as { text?: string }).text)).toContain(
    "terra: Terra 6.1 (gpt-6.1-terra)",
  );
  const pinned = await $.command.run({
    command: "gpt",
    args: "pin terra gpt-5.6-terra",
  } as never);
  expect(String((pinned as { text?: string }).text)).toContain(
    "terra: Terra 5.6 (gpt-5.6-terra) · pinned",
  );
  expect(w.store.gptPins).toEqual({ terra: "gpt-5.6-terra" });
});

test("with GPT off a build stays here and Codex is not read; a named family still runs", async ($, on) => {
  const w = world(on, { store: { gpt: false }, events: EVENTS });
  const out = await delegate($, {
    role: "build",
    brief: "Add a submit button.",
  });
  expect(out).toBe("Not delegated: GPT is off in the band: build it here.");
  expect(w.reads()).toBe(0);
  await delegate($, {
    role: "research",
    brief: "Weigh the retry options.",
    family: "sol",
  });
  expect(w.spawned[0]?.argv).toContain("gpt-6.1-sol");
});

test("the delegate schema stays in the prompt without changing its description", async ($, on) => {
  on("tool.describe", { tool: "mcp__kit__delegate" }, async () => ({
    description: "Stable description",
    isDeferred: true,
  }));
  const result = await $.tool.describe({
    tool: "mcp__kit__delegate",
    description: "Stable description",
    isDeferred: true,
    provider: { plugin: "kit", tier: "user" },
  } as never);
  expect(result).toEqual({
    description: "Stable description",
    isDeferred: false,
  });
});

test("each role receives its answer shape and length target", async ($, on) => {
  const w = world(on, { events: EVENTS });
  for (const role of [
    "search",
    "research",
    "plan",
    "review",
    "build",
    "build+",
  ]) {
    await delegate($, {
      role,
      brief: "A task.",
      family: "sol",
      author: "claude",
    });
    const prompt = w.spawned[w.spawned.length - 1]?.input ?? "";
    expect(prompt).toContain(
      `Aim for ${role === "search" || role === "build" ? 2000 : 4000} characters or less`,
    );
    expect(prompt).toContain(
      "Conclusion first; evidence as file:line; uncertainties",
    );
    expect(prompt).toContain("No command logs");
    expect(prompt).toContain("file contents beyond short quotes, or diffs");
    if (role === "build" || role === "build+") {
      expect(prompt).toContain("Commit, push and deploy nothing");
      expect(prompt).toContain("checks run and their results");
    } else expect(prompt).toContain("Read only: change no files");
    if (role === "review") expect(prompt).toContain("[P0] to [P3]");
  }
});

test("a cut answer says whether its thread can be resumed", async ($, on) => {
  const long = JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: "x".repeat(6001) },
  });
  world(on, { events: [long] });
  const without = await delegate($, {
    role: "research",
    brief: "Research.",
    family: "sol",
  });
  expect(without).toContain("[incomplete: cut at 6000 characters]");
});

test("a cut answer includes its thread for retrieving the rest", async ($, on) => {
  const long = JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: "x".repeat(6001) },
  });
  world(on, {
    events: [
      JSON.stringify({ type: "thread.started", thread_id: "t-123" }),
      long,
    ],
  });
  const withThread = await delegate($, {
    role: "research",
    brief: "Research.",
    family: "sol",
  });
  expect(withThread).toContain(
    '[incomplete: cut at 6000 characters, ask for the rest with thread "t-123"]',
  );
});
