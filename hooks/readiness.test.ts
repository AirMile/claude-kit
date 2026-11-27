import type { SessionMessage } from "claude-code";
import { expect, test } from "claude-code/testing";

import { CHANGE_LABELS } from "./flow-policy";
import { bash, stop, world, write } from "./flow-fixture";
import { labelAnswer } from "./label-fixture";
import { LABELS } from "./model-policy";
import { isKitNote } from "./kit-notes";
import { isReadinessNote, readinessBlock, turnBlock } from "./readiness";

const user = (text: string): SessionMessage => ({
  role: "user",
  text,
  toolUses: [],
});
const said = (text: string): SessionMessage => ({
  role: "assistant",
  text,
  toolUses: [],
});
const result: SessionMessage = {
  role: "user",
  text: "",
  toolUses: [],
  toolResults: [{ tool_use_id: "t1", text: "ok", isError: false } as never],
};
const BLOCK = [
  "Goal:        a band ring per plan",
  "Size:        2 files",
  "Verify:      ring test -> claude plugin test .",
  "Open:        none",
].join("\n");
const fenced = `Here is the block.\n\n\`\`\`\n${BLOCK}\n\`\`\`\n\nStarting.`;
const ID = Date.parse("2026-10-27T12:00:00Z"); // the fixture's clock: the first edit opens the task

test("a block finds Goal through Open, bold labels too, nothing more", () => {
  expect(readinessBlock(fenced)).toBe(BLOCK);
  expect(readinessBlock("**Goal:** x\nSize: 1\n**Open:** none")).toBe(
    "**Goal:** x\nSize: 1\n**Open:** none",
  );
  expect(readinessBlock("Goal: x\nno end")).toBe(undefined);
  // A corrected block later in the same reply wins.
  const fixed = BLOCK.replace("2 files", "3 files");
  expect(readinessBlock(`${BLOCK}\n\nCorrection:\n${fixed}`)).toBe(fixed);
  // An unfinished first block does not swallow the full one after it.
  expect(readinessBlock(`Goal: old\nSize: 1\n\n${fixed}`)).toBe(fixed);
});

test("only the running turn's block counts: tool results and kit notes do not end it", () => {
  expect(
    turnBlock([user("bouw"), said(fenced), result, said("working")], isKitNote),
  ).toBe(BLOCK);
  const recent = user(
    "kit recent messages: the user's latest messages in this chat, word for word, restored after compaction. x",
  );
  expect(turnBlock([said(fenced), recent, said("working")], isKitNote)).toBe(
    BLOCK,
  );
  // A block before the user's last prompt is an earlier turn's.
  expect(
    turnBlock([said(fenced), user("iets anders"), said("ok")], isKitNote),
  ).toBe(undefined);
});

function summary(on: Parameters<typeof world>[0]) {
  on("session.compact", async () => ({
    messages: [user("summary")],
    tokensBefore: 100_000,
    tokensAfter: 10_000,
  }));
}

const compact = async (
  $: Parameters<Parameters<typeof test>[1]>[0],
  messages: SessionMessage[],
) =>
  (
    (await $.session.compact({
      trigger: "auto",
      messages,
      instructions: "",
    } as never)) as { messages: SessionMessage[] }
  ).messages;

test("the block a turn of the open task wrote is kept on the task and comes back without the transcript", async ($, on) => {
  const w = world(on);
  let history: SessionMessage[] = [user("bouw de ring"), said(fenced)];
  on("session.messages", async () => ({ value: history }));
  let kept: SessionMessage[] = [user("summary")];
  on("session.compact", async () => ({ messages: kept }));
  await write($, "/p/app/src/a.ts");
  await stop($);
  expect(w.store.flowTasks).toMatchObject({ s1: { readiness: BLOCK } });
  history = [user("summary")];
  // The transcript before this compaction no longer holds the block: the task does.
  const out = await compact($, [user("summary"), said("working")]);
  const notes = out.filter(isReadinessNote);
  expect(notes.length).toBe(1);
  expect(notes[0]!.text).toBe(
    `kit readiness (task ${ID}): the open task's readiness block, word for word, restored after compaction.\n${BLOCK}`,
  );
  // A second compaction that kept the first note still has exactly one.
  kept = [user("summary"), notes[0]!];
  expect(
    (await compact($, [...out, said("more")])).filter(isReadinessNote).length,
  ).toBe(1);
});

test("a block, the go-ahead, then the first edit: the new task takes the block", async ($, on) => {
  const w = world(on);
  on("session.messages", async () => ({
    value: [user("plan it"), said(fenced)],
  }));
  await stop($, "Shall I build this?");
  w.later(1_000);
  await write($, "/p/app/src/a.ts");
  await bash($, "claude plugin test .");
  w.later(1_000);
  await stop($);
  expect(
    (w.store.flowTasks as Record<string, { readiness?: string }>).s1?.readiness,
  ).toBe(BLOCK);
});

test("a block written mid-turn is caught at compaction; another task's kept note goes", async ($, on) => {
  world(on);
  on("fs.read", async () => {
    throw new Error("missing");
  });
  const stale = `kit readiness (task 1): the open task's readiness block, word for word, restored after compaction.\n${BLOCK}`;
  on("session.compact", async () => ({
    messages: [user(stale), user("summary")],
    tokensBefore: 100_000,
    tokensAfter: 10_000,
  }));
  await write($, "/p/app/src/a.ts");
  const out = await compact($, [user("bouw"), said(fenced), result]);
  const notes = out.filter(isReadinessNote);
  expect(notes.length).toBe(1);
  expect(notes[0]!.text).toContain(`task ${ID}`);
  expect(out.indexOf(notes[0]!)).toBeGreaterThan(
    out.findIndex((m) => m.text === "summary"),
  );
});

test("no open task: a kept note goes", async ($, on) => {
  world(on);
  const stale = `kit readiness (task 1): the open task's readiness block, word for word, restored after compaction.\n${BLOCK}`;
  on("session.compact", async () => ({
    messages: [user(stale), user("summary")],
  }));
  expect((await compact($, [user(stale)])).filter(isReadinessNote).length).toBe(
    0,
  );
});

test("a pending block waits one prompt only, and /clear drops it", async ($, on) => {
  const w = world(on);
  on("session.end", async () => ({ sessionId: "s1" }));
  let history: SessionMessage[] = [user("plan it"), said(fenced)];
  on("session.messages", async () => ({ value: history }));
  await stop($, "Shall I build this?");
  history = [];
  await $.session.end({ reason: "clear" } as never);
  w.later(1_000);
  await write($, "/p/app/src/a.ts");
  await bash($, "claude plugin test .");
  w.later(1_000);
  await stop($);
  expect(
    (w.store.flowTasks as Record<string, { readiness?: string } | undefined>).s1
      ?.readiness,
  ).toBe(undefined);
});

test("a request of its own after the block drops it; a short go-ahead keeps it", async ($, on) => {
  const w = world(on, { mode: "off" });
  on("model.classify", async () => ({ value: LABELS.routine }));
  on("model.complete", async (_$, e) =>
    labelAnswer(e.prompt, { change: CHANGE_LABELS.light }),
  );
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  let history: SessionMessage[] = [user("plan A"), said(fenced)];
  on("session.messages", async () => ({ value: history }));
  const readiness = () =>
    (w.store.flowTasks as Record<string, { readiness?: string } | undefined>).s1
      ?.readiness;
  await stop($, "Shall I build plan A?");
  history = [];
  await $.prompt.submit({
    text: "Forget that, change the retry handling in src/b.ts instead",
    origin: { kind: "composer" },
  });
  w.later(1_000);
  await write($, "/p/app/src/b.ts");
  await bash($, "claude plugin test .");
  w.later(1_000);
  await stop($);
  expect(readiness()).toBe(undefined);
});

test("a short command after the block drops it too", async ($, on) => {
  const w = world(on, { mode: "off" });
  on("model.classify", async () => ({ value: LABELS.routine }));
  on("model.complete", async (_$, e) =>
    labelAnswer(e.prompt, { change: CHANGE_LABELS.light }),
  );
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  let history: SessionMessage[] = [user("plan A"), said(fenced)];
  on("session.messages", async () => ({ value: history }));
  const readiness = () =>
    (w.store.flowTasks as Record<string, { readiness?: string } | undefined>).s1
      ?.readiness;
  await stop($, "Shall I build plan A?");
  history = [];
  await $.prompt.submit({
    text: "/task-readiness b",
    origin: { kind: "composer" },
  });
  w.later(1_000);
  await write($, "/p/app/src/b.ts");
  await bash($, "claude plugin test .");
  w.later(1_000);
  await stop($);
  expect(readiness()).toBe(undefined);
});

test("block, go-ahead, a compaction before the first edit: the task still gets the block", async ($, on) => {
  const w = world(on, { mode: "off" });
  on("model.classify", async () => ({ value: LABELS.routine }));
  on("model.complete", async (_$, e) =>
    labelAnswer(e.prompt, { change: CHANGE_LABELS.light }),
  );
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  on("session.compact", async () => ({ messages: [user("summary")] }));
  let history: SessionMessage[] = [user("plan it"), said(fenced)];
  on("session.messages", async () => ({ value: history }));
  await stop($, "Shall I build this?");
  history = [user("summary")];
  await $.prompt.submit({ text: "ja, bouwen", origin: { kind: "composer" } });
  await compact($, [user("summary"), user("ja, bouwen"), said("ok")]);
  await compact($, [user("summary")]);
  w.later(1_000);
  await write($, "/p/app/src/a.ts");
  await bash($, "claude plugin test .");
  w.later(1_000);
  await stop($);
  expect(
    (w.store.flowTasks as Record<string, { readiness?: string } | undefined>).s1
      ?.readiness,
  ).toBe(BLOCK);
});

test("a turn that ends with background work still keeps its block", async ($, on) => {
  const w = world(on);
  on("session.messages", async () => ({ value: [user("bouw"), said(fenced)] }));
  await write($, "/p/app/src/a.ts");
  await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: "Server runs.",
    background_tasks: [{ id: "b1" }],
  } as never);
  expect(
    (w.store.flowTasks as Record<string, { readiness?: string } | undefined>).s1
      ?.readiness,
  ).toBe(BLOCK);
});
