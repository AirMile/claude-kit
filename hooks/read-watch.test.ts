import { expect, test } from "claude-code/testing";

import { EXPLORE_LABELS } from "./explore-first";
import { CHANGE_LABELS } from "./flow-policy";
import { world } from "./read-watch-fixture";
import { VERIFY_LABELS } from "./task-policy";

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

test("explore raises Define to D2; one call labels it; the decision is logged", async ($, on) => {
  const w = world(on, { explore: true, change: true });
  await $.command.run({ command: "gpt", args: "" });
  await prompt($, "Change the retry handling in this repository");
  const context = String(w.prompts[0]?.context);
  expect(context).toContain("kit flow (medium)");
  expect(context).toContain("kit task: D2 E1 V1.");
  expect(context).toContain("role research");
  expect(context).toContain("role build");
  expect(w.completed.length).toBe(1);
  expect(w.completed[0]?.prompt).toContain(
    "Change the retry handling in this repository",
  );
  expect(w.completed[0]?.model).toBe("haiku");
  const decisions = (
    w.store.flowLog as { event: string; levels?: string; gpt5h?: number }[]
  ).filter((e) => e.event === "decision");
  expect(decisions.length).toBe(1);
  expect(decisions[0]?.levels).toBe("D2 E1 V1");
  expect(decisions[0]?.gpt5h).toBe(10);
});

test("questions explore too; thin replies, build prompts and GPT off skip the explore classifier", async ($, on) => {
  const w = world(on, { explore: true });
  await $.command.run({ command: "gpt", args: "" });
  const explored = () =>
    w.completed.filter((c) => c.prompt.includes(EXPLORE_LABELS.explore)).length;
  await prompt($);
  expect(String(w.prompts.at(-1)?.context)).toContain("kit task: D2 E0 V0.");
  expect(explored()).toBe(1);
  await prompt($, "ja");
  expect(String(w.prompts.at(-1)?.context)).not.toContain("kit task");
  await prompt($, "/kit:build retries");
  expect(explored()).toBe(1);
  await $.command.run({ command: "gpt", args: "off" });
  await prompt($);
  expect(explored()).toBe(1);
  expect(String(w.prompts.at(-1)?.context)).not.toContain("kit task");
});

test("council asks set D3 for that prompt; without room for Astra it becomes D2", async ($, on) => {
  const w = world(on, { change: true });
  await $.command.run({ command: "gpt", args: "" });
  await prompt($, "Laat sol en astra meedenken over de retry handling");
  expect(String(w.prompts.at(-1)?.context)).toContain("kit task: D3 E1 V1.");
  expect(String(w.prompts.at(-1)?.context)).toContain("family astra");
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

for (const status of ["pass", "failing", "stopped", "not run"] as const) {
  test(`run_task measurement and read reset: ${status}`, async ($, on) => {
    const w = world(on, { runTask: status, off: status === "not run" });
    await prompt($);
    for (let i = 0; i < 4; i++) await read($);
    const out = await $.tool.call({
      tool: "mcp__kit__run_task",
      brief: "Fix the retry.",
      checks: [["/cover"]],
    } as never);
    expect(String(out.result)).toContain(`run_task ${status}`);
    expect((await read($)).context?.length).toBe(status === "not run" ? 2 : 1);
    const entries = (w.store.flowLog as Record<string, unknown>[]).filter(
      (e) => e.event === "delegate",
    );
    expect(entries[0]).toMatchObject({
      event: "delegate",
      text: "run_task",
      provider: status === "not run" ? "none" : "gpt",
      outcome: status === "pass" ? "ok" : "failed",
      durationMs: status === "not run" ? 0 : status === "failing" ? 150 : 50,
    });
  });
}
