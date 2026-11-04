import { expect, test, type TestBody } from "claude-code/testing";

import { FOOTER } from "./delegate-run";
import { newTask, type Task, CHANGE_LABELS } from "./flow-policy";
import { VERIFY_LABELS } from "./task-policy";
import { LABELS } from "./model-policy";
import { world, write, bash, stop } from "./flow-fixture";
import { labelAnswer } from "./label-fixture";

const stored = (over: Partial<Task> = {}) => ({
  mode: "off",
  flowTasks: {
    s1: {
      ...newTask(1, "light"),
      levels: { d: 1, e: 0, v: 2, r: 0 },
      gateV: 2,
      ...over,
    },
  },
});
const ask = ($: Parameters<TestBody>[0], text: string) =>
  $.prompt.submit({ text, origin: { kind: "composer" } });

test("a red V1 check raises only the note, including after another prompt; growth raises the gate even at the note cap", async ($, on) => {
  const w = world(on, stored({ gateV: 1, levels: { d: 1, e: 0, v: 1, r: 0 } }));
  on("model.classify", async () => ({ value: LABELS.routine }));
  on("model.complete", async (_$, e) => labelAnswer(e.prompt, {
    change: CHANGE_LABELS.light,
    verify: VERIFY_LABELS.behaviour,
  }));
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  await write($, "src/a.ts");
  await bash($, "npm test fail");
  const current = () => (w.store.flowTasks as { s1: Task }).s1;
  expect(current().levels?.v).toBe(2); // V1 + first failure
  expect(current().gateV).toBe(1);
  await ask($, "Also adjust the retry delay in this function");
  expect(current().gateV).toBe(1);
  for (const f of ["b", "c", "d"]) await write($, `src/${f}.ts`);
  // The folded request counts its own files; the fifth file grows the track.
  await write($, "src/e.ts");
  expect(current().gateV).toBe(2);
  w.later(10);
  await bash($, "npm test");
  expect((await stop($)).block).toContain("no review yet");
});

for (const gpt of [false, true]) {
  test(`Claude's marked subagent review counts only with GPT authorship (${gpt})`, async ($, on) => {
    const w = world(on, stored({ gptWrote: gpt }));
    on("agent.spawn", async () => ({ model: "sonnet", agentId: "reviewer" }));
    on("turn.complete", async () => ({ text: "" }));
    await write($, "src/a.ts");
    w.later(10);
    await $.agent.spawn({
      subagentType: "general-purpose",
      prompt: FOOTER.review,
      provider: { plugin: "engine" },
    } as never);
    await $.turn.complete({
      agentId: "reviewer",
      answer: "**verdict:** pass\nfailure-paths: retry",
      reason: "answer",
    } as never);
    await bash($, "npm test");
    expect((w.store.flowTasks as { s1: Task }).s1.review).toMatchObject({
      family: "claude",
      outcome: "pass",
      depth: true,
    });
    expect("kind" in (w.store.flowTasks as { s1: Task }).s1.review!).toBe(false);
    expect((await stop($)).block === undefined).toBe(gpt);
  });
}

test("a verifier binds to its spawn print and an untracked answer is ignored", async ($, on) => {
  const git = { index: "a", work: "a" };
  const w = world(
    on,
    stored({ track: "heavy", spec: true, gptWrote: true }),
    git,
  );
  on("agent.spawn", async () => ({ model: "sonnet", agentId: "verifier" }));
  on("turn.complete", async () => ({ text: "" }));
  await write($, "src/a.ts");
  git.work = "b";
  await $.agent.spawn({
    subagentType: "kit:verifier",
    prompt: "Verify",
    provider: { plugin: "kit" },
  } as never);
  git.work = "c";
  await write($, "src/a.ts");
  await $.turn.complete({
    agentId: "unknown",
    answer: "suite: pass",
    reason: "answer",
  } as never);
  expect((w.store.flowTasks as { s1: Task }).s1.verifier).toBe(undefined);
  await $.turn.complete({
    agentId: "verifier",
    answer: "suite: pass",
    reason: "answer",
  } as never);
  await bash($, "npm test");
  expect((await stop($)).block).toContain("spec has no verification yet");
});

test("skip ends as waived on the next request", async ($, on) => {
  const w = world(on, stored());
  on("model.classify", async () => ({ value: LABELS.routine }));
  on("model.complete", async (_$, e) => labelAnswer(e.prompt, { change: CHANGE_LABELS.light }));
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  await write($, "src/a.ts");
  await ask($, "skip verify");
  await ask($, "Now change how the retry timeout is computed in src/a.ts");
  expect(
    (w.store.flowLog as { outcome?: string }[]).some(
      (e) => e.outcome === "waived",
    ),
  ).toBe(true);
});

test("stored reviews reload with their evidence", async ($, on) => {
  const w = world(
    on,
    stored({
      lastEditAt: 1,
      lastCheckAt: 3,
      claudeWrote: true,
      review: { outcome: "pass", family: "gpt", depth: false, at: 2 },
    }),
  );
  expect((await stop($)).block).toBe(undefined);
  expect((w.store.flowLog as { outcome?: string }[]).at(-1)?.outcome).toBe(
    "verified",
  );
});

for (const gateV of [1, 2] as const) {
  test(`recovery names the other-family review at V2+ (${gateV})`, async ($, on) => {
    world(on, stored({ gateV, lastEditAt: 1 }));
    on("session.compact", async () => ({
      messages: [{ role: "user", text: "Summary", toolUses: [] }],
      tokensBefore: 10,
      tokensAfter: 1,
    }));
    await stop($); // loads the open task without closing it
    const result = await $.session.compact({
      trigger: "manual",
      messages: [{ role: "user", text: "Continue", toolUses: [] }],
    });
    expect(JSON.stringify(result).includes("and an other-family review")).toBe(
      gateV >= 2,
    );
  });
}

test("a passing check closes V1 after the first failing check raised its note", async ($, on) => {
  const w = world(on, stored({ gateV: 1, levels: { d: 1, e: 0, v: 1, r: 0 } }));
  await write($, "src/a.ts");
  await bash($, "npm test fail");
  expect((w.store.flowTasks as { s1: Task }).s1.levels?.v).toBe(2);
  w.later(10);
  await bash($, "npm test");
  expect((await stop($)).block).toBe(undefined);
  expect((w.store.flowLog as { outcome?: string }[]).at(-1)?.outcome).toBe(
    "verified",
  );
});

test("edit growth raises gateV even when note levels are capped", async ($, on) => {
  const w = world(on, stored({ gateV: 1, levels: { d: 1, e: 0, v: 3, r: 0 } }));
  for (const f of ["a", "b", "c", "d"]) await write($, `src/${f}.ts`);
  const task = (w.store.flowTasks as { s1: Task }).s1;
  expect(task.levels?.v).toBe(3);
  expect(task.gateV).toBe(2);
});

test("a shared-code prompt stores V2 as the gate and a thin reply keeps it", async ($, on) => {
  const w = world(on, { mode: "off" });
  on("model.classify", async () => ({ value: LABELS.routine }));
  on("model.complete", async (_$, e) => labelAnswer(e.prompt, {
    change: CHANGE_LABELS.light,
    verify: VERIFY_LABELS.shared,
  }));
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  await ask($, "Change the shared retry contract in src/a.ts");
  expect((w.store.flowTasks as { s1: Task }).s1.gateV).toBe(2);
  await ask($, "ja");
  expect((w.store.flowTasks as { s1: Task }).s1.gateV).toBe(2);
});


test("flow command shows the open task after a hold", async ($, on) => {
  world(on, stored());
  await write($, "src/a.ts");
  expect((await stop($)).block).toContain("no review yet");
  const out = await $.command.run({ command: "flow", args: "" } as never);
  expect(out.text).toContain('open: light task, src/a.ts: still needs a passing check on this code; a review: no review yet. "skip verify" waives it.');
});

test("clear logs reset for an open task", async ($, on) => {
  const w = world(on, stored());
  on("session.end", async () => ({ sessionId: "s1" }));
  await write($, "src/a.ts");
  await $.session.end({ reason: "clear" } as never);
  expect((w.store.flowLog as { event?: string; outcome?: string }[]).at(-1)).toMatchObject({ event: "end", outcome: "reset" });
});
