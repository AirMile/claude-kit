import { expect, test } from "claude-code/testing";

import { newTask, type Task, CHANGE_LABELS } from "./flow-policy";
import { LABELS } from "./model-policy";
import { world, delegate } from "./delegate-fixture";
import { labelAnswer } from "./label-fixture";

const task = (): Task => ({
  ...newTask(1, "light"),
  gateV: 2,
  levels: { d: 1, e: 0, v: 2, r: 0 },
  lastEditAt: 1,
  lastCheckAt: 2,
  files: ["src/a.ts"],
  claudeWrote: true,
});

for (const error of [undefined, "stream broke"]) {
  test(`review reads the full answer before truncation and errors override pass (${error})`, async ($, on) => {
    on("session.id", async () => ({ value: "s1" }));
    on("ui.log", async () => ({ value: undefined }));
    const w = world(on, {
      store: { flowTasks: { s1: task() } },
      events: [
        JSON.stringify({
          type: "item.completed",
          item: {
            type: "agent_message",
            text:
              "verdict: pass\n" + "x".repeat(6100) + "\nfailure-paths: timeout",
          },
        }),
        ...(error
          ? [JSON.stringify({ type: "turn.failed", error: { message: error } })]
          : []),
      ],
    });
    const out = await delegate($, { role: "review", brief: "Review" });
    expect(out).toContain("incomplete: cut at 6000");
    const review = (w.store.flowTasks as { s1: Task }).s1.review;
    expect(review?.outcome).toBe(error ? "error" : "pass");
    if (error) expect(review?.error).toContain(error);
    else expect(review?.depth).toBe(true);
  });
}

test("a fail remains evidence when the review run errors", async ($, on) => {
  on("session.id", async () => ({ value: "s1" }));
  on("ui.log", async () => ({ value: undefined }));
  const w = world(on, {
    store: { flowTasks: { s1: task() } },
    events: [
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "verdict: fail\n[P1] failure" },
      }),
      JSON.stringify({ type: "turn.failed", error: { message: "offline" } }),
    ],
  });
  await delegate($, { role: "review", brief: "Review" });
  expect((w.store.flowTasks as { s1: Task }).s1.review?.outcome).toBe("fail");
});

test("an error without an answer is review error evidence", async ($, on) => {
  on("session.id", async () => ({ value: "s1" }));
  on("ui.log", async () => ({ value: undefined }));
  const w = world(on, {
    store: { flowTasks: { s1: task() } },
    events: [
      JSON.stringify({ type: "turn.failed", error: { message: "offline" } }),
    ],
  });
  await delegate($, { role: "review", brief: "Review" });
  expect((w.store.flowTasks as { s1: Task }).s1.review).toMatchObject({
    outcome: "error",
    error: "offline",
  });
});

test("Not delegated excuses this round's review hold; the next change folds without ending", async ($, on) => {
  on("session.id", async () => ({ value: "s1" }));
  on("ui.log", async () => ({ value: undefined }));
  on("ui.invalidate", async () => ({ value: undefined }));
  on("clock.after", async () => ({ value: undefined }));
  on("classic.Stop", async () => ({ value: {} }));
  on("model.classify", async () => ({ value: LABELS.routine }));
  on("model.complete", async (_$, e) => labelAnswer(e.prompt, { change: CHANGE_LABELS.light }));
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  const w = world(on, {
    store: { mode: "off", gpt: false, flowTasks: { s1: task() } },
  });
  const out = await delegate($, { role: "review", brief: "Review" });
  expect(out).toContain("Not delegated");
  const stopped = await $.classic.Stop({
    last_assistant_message: "Done.",
    background_tasks: [],
    stop_hook_active: false,
  } as never);
  expect(stopped.block).toBe(undefined);
  expect((w.store.flowTasks as { s1: Task }).s1).toBeTruthy();
  await $.prompt.submit({
    text: "Also change how the retry delay is computed",
    origin: { kind: "composer" },
  });
  const log = w.store.flowLog as { event: string; reason?: string }[];
  expect(
    log.some(
      (e) => e.event === "fold" && e.reason === "new request on open work",
    ),
  ).toBe(true);
  expect(log.some((e) => e.event === "end")).toBe(false);
});

test("V2 is held on review after a passing check, then GPT's pass closes verified", async ($, on) => {
  on("session.id", async () => ({ value: "s1" }));
  on("ui.log", async () => ({ value: undefined }));
  on("classic.Stop", async () => ({ value: {} }));
  const w = world(on, {
    store: { flowTasks: { s1: task() } },
    events: [
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "verdict: pass" },
      }),
    ],
  });
  const stop = () =>
    $.classic.Stop({
      last_assistant_message: "Done.",
      background_tasks: [],
      stop_hook_active: false,
    } as never);
  expect((await stop()).block).toContain("no review yet");
  await delegate($, { role: "review", brief: "Review" });
  expect((w.store.flowTasks as { s1: Task }).s1.review?.outcome).toBe("pass");
  expect((await stop()).block).toBe(undefined);
  expect((w.store.flowLog as { outcome?: string }[]).at(-1)?.outcome).toBe(
    "verified",
  );
});
