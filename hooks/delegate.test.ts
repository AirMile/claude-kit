import { expect, test } from "claude-code/testing";

import type { Task } from "./flow-policy";
import { world, delegate } from "./delegate-fixture";

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
  const task = Object.values(w.store.flowTasks as Record<string, Task>)[0];
  expect(task?.gptWrote).toBe(true);
  expect(task?.claudeWrote).toBe(undefined);
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
    {
      event: "delegate",
      text: "search",
      provider: "gpt",
      outcome: "ok",
      durationMs: 0,
    },
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
  expect(w.spawned[1]?.argv).toContain("gpt-6-astra");
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
  expect(w.spawned[0]?.input).toContain(
    "start the answer with a line `verdict: pass` or `verdict: fail`",
  );
  expect(w.spawned[0]?.input).toContain("fail = any [P0] or [P1]");
  expect(w.spawned[0]?.input).toContain(
    "failure-paths: <the failure paths and integration points you checked>",
  );
});

test("without Codex a change is built here and research goes to Claude, saying why", async ($, on) => {
  const w = world(on, {
    status: {
      argv: null,
      state: "missing",
      models: [],
      limits: {},
      error: "codex not found",
    },
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
  expect(read).toContain(
    'Add to the subagent prompt: "Read only: change no files. Aim for 4000 characters or less. Conclusion first; evidence as file:line; uncertainties. No command logs, file contents beyond short quotes, or diffs."',
  );
  expect(w.store.flowLog).toMatchObject([
    { event: "delegate", text: "build", provider: "none", outcome: "failed" },
    { event: "delegate", text: "research", provider: "claude", outcome: "ok" },
  ]);
});

test("/gpt shows the newest model per family and pins one", async ($, on) => {
  const w = world(on);
  const shown = await $.command.run({ command: "gpt", args: "" } as never);
  expect(String((shown as { text?: string }).text)).toContain(
    "terra: Terra 6.1 (gpt-6.1-terra)",
  );
  expect(String((shown as { text?: string }).text)).toContain("balance: ");
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

for (const thread of [undefined, "t-123"]) {
  test(`a cut answer ${thread ? "includes its thread" : "says whether its thread can be resumed"}`, async ($, on) => {
    const long = JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "x".repeat(6001) },
    });
    world(on, {
      events: thread
        ? [JSON.stringify({ type: "thread.started", thread_id: thread }), long]
        : [long],
    });
    const out = await delegate($, {
      role: "research",
      brief: "Research.",
      family: "sol",
    });
    expect(out).toContain(
      thread
        ? '[incomplete: cut at 6000 characters, ask for the rest with thread "t-123"]'
        : "[incomplete: cut at 6000 characters]",
    );
  });
}
