import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

import { EXPLORE_LABELS } from "./explore-first";
import { CHANGE_LABELS } from "./flow-policy";
import { LABELS } from "./model-policy";

// Drive the installed mod through prompts and tools; never pass the test's $ to a module.
function world(
  on: On,
  opts: {
    explore?: boolean;
    change?: boolean;
    off?: boolean;
    delegate?: "ok" | "claude" | "failed" | "partial" | "none";
  } = {},
) {
  const store: Record<string, unknown> = { mode: "off", gpt: !opts.off };
  const prompts: { context?: readonly string[] }[] = [];
  const classified: {
    text: string;
    labels: readonly string[];
    model?: string;
  }[] = [];
  const resetsAt = "2026-11-03T12:00:00Z";
  let gptPct = 10;
  let elapsed = 0;
  on("session.id", async () => ({ value: "s1" }));
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.usage", async () => ({
    value: { context: { percent: 10 }, rateLimits: [] },
  }));
  on("session.measure", async (_$, e) => ({ changed: e.changed }));
  on("clock.now", async () => ({
    value: Date.parse("2026-10-27T12:00:00Z") + elapsed,
  }));
  on("ui.log", async () => ({ value: undefined }));
  on("ui.invalidate", async () => ({ value: undefined }));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("model.classify", async (_$, e) => {
    classified.push({
      text: e.text,
      labels: e.labels,
      model: e.options?.model,
    });
    return {
      value: e.labels.includes(EXPLORE_LABELS.explore)
        ? opts.explore
          ? EXPLORE_LABELS.explore
          : EXPLORE_LABELS.direct
        : e.labels.includes(CHANGE_LABELS.none)
          ? opts.change
            ? CHANGE_LABELS.medium
            : CHANGE_LABELS.none
          : opts.change
            ? LABELS.routine
            : LABELS.question,
    };
  });
  on("process.run", async (_$, e) => ({
    value:
      e.argv[0] === "node"
        ? {
            exitCode: 0,
            stdout: JSON.stringify({
              argv: ["/bin/codex"],
              models: opts.delegate ? [{ id: "gpt-6-luna" }] : [],
              limits: {
                five_hour: { pct: 10 },
                seven_day: { pct: gptPct, resetsAt },
              },
            }),
            stderr: "",
          }
        : { exitCode: 1, stdout: "", stderr: "" },
  }));
  on("process.spawn", async function* () {
    elapsed += 50;
    if (opts.delegate !== "failed")
      yield {
        stream: "stdout" as const,
        text:
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: "Done." },
          }) + "\n",
      };
    if (opts.delegate === "failed" || opts.delegate === "partial")
      yield {
        stream: "stdout" as const,
        text:
          JSON.stringify({
            type: "turn.failed",
            error: { message: "offline" },
          }) + "\n",
      };
    return { value: { code: 0, signal: null } };
  });
  on("prompt.submit", async (_$, e) => {
    prompts.push({ context: e.context });
    return { text: e.text };
  });
  on(
    "tool.call",
    { tool: ["Read", "Grep", "Glob", "Bash", "Edit", "Write"] },
    async (_$, e) => ({
      result: "ok" as never,
      isError: e.tool === "Read" && e.file_path.includes("broken"),
      text: "x".repeat(e.tool === "Read" ? (e.limit ?? 1) : 1),
      context: ["existing context"],
    }),
  );
  return {
    store,
    prompts,
    classified,
    resetsAt,
    gpt: (pct: number) => {
      gptPct = pct;
    },
  };
}

type T$ = Parameters<Parameters<typeof test>[1]>[0];
const prompt = ($: T$, text = "Find the retry logic in this repository") =>
  $.prompt.submit({ text, origin: { kind: "composer" } });
const read = ($: T$, chars = 1) =>
  $.tool.call({
    tool: "Read",
    file_path: "/p/app/a.ts",
    limit: chars,
  } as never);
const measure = (percentUsed: number, resetsAt: string) =>
  ({
    context: { percent: 10, tokens: 20000 },
    rateLimits: [{ kind: "seven_day", percentUsed, resetsAt }],
    changed: ["rateLimits"],
  }) as never;

test("an explore note accompanies the flow note and both classifiers see the same input", async ($, on) => {
  const w = world(on, { explore: true, change: true });
  await $.command.run({ command: "gpt", args: "" });
  await prompt($, "Change the retry handling in this repository");
  expect(String(w.prompts[0]?.context)).toContain("kit flow (medium)");
  expect(String(w.prompts[0]?.context)).toContain(
    "kit: start by handing the exploring",
  );
  const classifiers = w.classified.filter(
    (c) =>
      c.labels.includes(EXPLORE_LABELS.explore) ||
      c.labels.includes(CHANGE_LABELS.none),
  );
  expect(classifiers.length).toBe(2);
  expect(classifiers[0]?.text).toBe(classifiers[1]?.text);
  expect(classifiers.every((c) => c.model === "haiku")).toBe(true);
  expect(
    (w.store.flowLog as { event: string }[]).filter(
      (e) => e.event === "explore-note",
    ).length,
  ).toBe(1);
});

test("questions explore too; thin replies, build prompts and GPT off do not", async ($, on) => {
  const w = world(on, { explore: true });
  await $.command.run({ command: "gpt", args: "" });
  await prompt($);
  expect(String(w.prompts.at(-1)?.context)).toContain(
    "kit: start by handing the exploring",
  );
  await prompt($, "ja");
  expect(String(w.prompts.at(-1)?.context)).not.toContain("start by handing");
  await prompt($, "/kit:build retries");
  expect(String(w.prompts.at(-1)?.context)).not.toContain("start by handing");
  await $.command.run({ command: "gpt", args: "off" });
  await prompt($);
  expect(String(w.prompts.at(-1)?.context)).not.toContain("start by handing");
});

test("read notes preserve tool context, exclude subagents and checks, and reset on a prompt", async ($, on) => {
  const w = world(on, { off: true });
  await prompt($);
  await $.tool.call({
    tool: "Read",
    file_path: "/p/app/a.ts",
    agentId: "a1",
    limit: 20000,
  } as never);
  await $.tool.call({ tool: "Bash", command: "npm test" } as never);
  await $.tool.call({
    tool: "Edit",
    file_path: "/p/app/a.ts",
    old_string: "x",
    new_string: "y",
  } as never);
  for (let i = 0; i < 4; i++)
    expect((await read($)).context).toEqual(["existing context"]);
  const fifth = await read($);
  expect(fifth.context?.[0]).toBe("existing context");
  expect(String(fifth.context)).toContain("read 5 times (5 characters)");
  expect((await read($)).context).toEqual(["existing context"]);
  await prompt($);
  expect((await read($, 15000)).context?.length).toBe(2);
  const notes = (w.store.flowLog as { event: string; text: string }[]).filter(
    (e) => e.event === "read-note",
  );
  expect(notes.map((e) => e.text)).toEqual([
    "5 calls, 5 chars",
    "1 calls, 15000 chars",
  ]);
});

test("Claude meter updates lower the budget and refreshed ChatGPT meters restore it", async ($, on) => {
  const w = world(on);
  await $.command.run({ command: "gpt", args: "" });
  await $.session.measure(measure(20, w.resetsAt));
  await prompt($);
  expect((await read($, 9999)).context?.length).toBe(1);
  expect(String((await read($)).context)).toContain("10000 characters");
  w.gpt(20);
  await $.command.run({ command: "gpt", args: "" });
  await prompt($);
  for (let i = 0; i < 4; i++) expect((await read($)).context?.length).toBe(1);
  expect(String((await read($)).context)).toContain("read 5 times");
});

test("failed reads do not use the turn's budget", async ($, on) => {
  world(on, { off: true });
  await prompt($);
  await $.tool.call({
    tool: "Read",
    file_path: "/p/app/broken",
    limit: 20000,
  } as never);
  for (let i = 0; i < 4; i++) expect((await read($)).context?.length).toBe(1);
  expect(String((await read($)).context)).toContain(
    "read 5 times (5 characters)",
  );
});

for (const outcome of ["ok", "claude", "failed", "partial", "none"] as const) {
  test(`delegate measurement and read reset: ${outcome}`, async ($, on) => {
    const w = world(on, {
      off: outcome === "claude" || outcome === "none",
      delegate: outcome,
    });
    await prompt($);
    for (let i = 0; i < 4; i++) await read($);
    const input = {
      tool: "mcp__kit__delegate",
      role: outcome === "none" ? "build" : "search",
      brief: "Find the retry code.",
    } as never;
    await $.tool.call(input);
    const ok = outcome === "ok" || outcome === "claude";
    // A partial GPT answer resets the reads too, but is measured as a failure.
    const resets = ok || outcome === "partial";
    expect((await read($)).context?.length).toBe(resets ? 1 : 2);
    if (resets) {
      for (let i = 0; i < 3; i++) await read($);
      expect(String((await read($)).context)).toContain(
        "read 5 times (5 characters)",
      );
      await $.tool.call(input);
      expect((await read($, 15000)).context?.length).toBe(1);
    }
    const entries = (w.store.flowLog as Record<string, unknown>[]).filter(
      (e) => e.event === "delegate",
    );
    expect(entries[0]).toMatchObject({
      text: outcome === "none" ? "build" : "search",
      provider:
        outcome === "claude" ? "claude" : outcome === "none" ? "none" : "gpt",
      outcome: ok ? "ok" : "failed",
      durationMs: outcome === "claude" || outcome === "none" ? 0 : 50,
    });
  });
}
