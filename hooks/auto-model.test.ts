import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
function world(
  on: On,
  opts: {
    model: string;
    label: string;
    answer?: string;
    turns?: number;
    percent?: number;
    store?: Record<string, unknown>;
    drawn?: true; // a mounted band redraws on ui.invalidate: leave it to the engine
  },
) {
  const asked: string[] = [];
  const offered: string[] = [];
  const sent: { text: string; origin: unknown }[] = [];
  const cleared: string[] = [];
  const store: Record<string, unknown> = { ...opts.store };
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.model", async () => ({ value: opts.model }));
  on("session.turns", async () => ({ value: opts.turns ?? 0 }));
  on("session.id", async () => ({ value: "s1" }));
  on("session.usage", async () => ({
    value: { context: { window: 200_000, percent: opts.percent } },
  }));
  on("clock.after", async () => ({ value: undefined }));
  on("ui.toast", async () => ({ value: undefined }));
  on("command.run", { command: "clear" }, async () => {
    cleared.push("clear");
    return { text: "" };
  });
  on("model.classify", async () => ({ value: opts.label }));
  // $.ui.ask is a tool.call of AskUserQuestion beneath; answered by question text.
  on("tool.call", { tool: "AskUserQuestion" }, async (_$, e) => {
    const { questions } = e as unknown as { questions: { question: string }[] };
    const question = questions[0]?.question ?? "";
    asked.push(question);
    offered.push(JSON.stringify(questions[0]));
    if (!opts.answer) return { deny: "dismissed" };
    return { result: { questions, answers: { [question]: opts.answer } } };
  });
  if (!opts.drawn) on("ui.invalidate", async () => ({ value: undefined }));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("store.delete", async (_$, e) => {
    delete store[e.key];
    return { value: undefined };
  });
  on("prompt.submit", async (_$, e) => {
    sent.push({ text: e.text, origin: e.origin });
    return { text: e.text };
  });
  on("classic.SessionStart", async () => ({ value: {} }));
  return { asked, offered, sent, cleared, store };
}
const TYPED = { kind: "composer" } as const;
const QUESTION =
  "question: explain, look something up, a short question or a one-line change";
const ROUTINE =
  "routine: write or change ordinary code, fix a clear bug, styling";
const HEAVY =
  "heavy: large refactor, a stuck or hard bug, a long multi-step build";
const settle = () => new Promise((r) => setTimeout(r, 20));

test("the first prompt asks to switch when the picked model differs", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: QUESTION,
    answer: "Switch to Haiku 5.5",
  });
  await $.prompt.submit({ text: "what does this function do?", origin: TYPED });
  await $.prompt.submit({ text: "and this one?", origin: TYPED });
  expect(w.asked.length).toBe(1); // only the first prompt picks a model
});

test("no question when the session already runs the picked model", async ($, on) => {
  const w = world(on, { model: "claude-sonnet-5-5", label: ROUTINE });
  await $.prompt.submit({ text: "add a submit button", origin: TYPED });
  expect(w.asked).toEqual([]);
});

test("/mode off stores the choice and leaves prompts alone", async ($, on) => {
  const w = world(on, { model: "claude-opus-5-5", label: QUESTION });
  const ran = await $.command.run({ command: "mode", args: "off" });
  expect(ran.text).toBe("kit profile: Off.");
  expect(w.store.mode).toBe("off");
  await $.prompt.submit({ text: "what does this do?", origin: TYPED });
  expect(w.asked).toEqual([]);
});

test("a new chat after /clear asks again; a resume does not", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: QUESTION,
    answer: "Stay on Opus 5.5",
  });
  await $.prompt.submit({ text: "what is this?", origin: TYPED });
  await $.classic.SessionStart({ source: "resume" });
  await $.prompt.submit({ text: "and that?", origin: TYPED });
  expect(w.asked.length).toBe(1);
  await $.classic.SessionStart({ source: "clear" });
  await $.prompt.submit({ text: "what is this file?", origin: TYPED });
  expect(w.asked.length).toBe(2);
});

test("two tiers short with a light context offers switch now; the switch is kept", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 10,
    answer: "Switch to Opus 5.5 now",
  });
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  expect(w.asked.length).toBe(1);
  expect(w.offered[0]).toContain("Switch to Opus 5.5 now");
  expect(w.sent.map((s) => s.text)).toEqual(["refactor the auth layer"]);
  expect(w.store.switches).toEqual({
    s1: { chosen: "claude-opus-5-5", base: "claude-haiku-5-5" },
  });
});

test("a full context offers no switch now; staying is not asked again", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 60,
    answer: "Stay on Haiku 5.5 at max effort",
  });
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  await $.prompt.submit({ text: "and the billing layer", origin: TYPED });
  expect(w.asked.length).toBe(1);
  expect(w.offered[0]).not.toContain("now");
  expect(w.sent.length).toBe(2);
});

test("one tier short runs without a question", async ($, on) => {
  const w = world(on, { model: "claude-haiku-5-5", label: ROUTINE, turns: 5 });
  await $.prompt.submit({ text: "add a submit button", origin: TYPED });
  expect(w.asked).toEqual([]);
});

test("a stored switch survives a reload: no question on the stronger model", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 60,
    store: { switches: { s1: { chosen: "claude-opus-5-5", base: "claude-haiku-5-5" } } },
  });
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  expect(w.asked).toEqual([]);
});

test("clear, then switch: the prompt is held, the chat cleared, and sent again", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 60,
    answer: "Clear, then Opus 5.5",
  });
  const r = await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  expect(String((r as { drop?: string }).drop)).toContain("clearing");
  await settle();
  expect(w.cleared).toEqual(["clear"]);
  expect(w.sent.map((s) => s.text)).toEqual(["refactor the auth layer"]);
  expect(w.store.switches).toEqual({
    s1: { chosen: "claude-opus-5-5", base: "claude-haiku-5-5" },
  });
});

// The band as the terminal draws it; a press acts as a click does.
function band($: Parameters<Parameters<typeof test>[1]>[0], on: On) {
  on("ui.panes", async () => ({ value: [] }));
  on("clock.now", async () => ({ value: Date.parse("2026-10-16T12:00:00Z") }));
  on("clock.every", () => new Promise<never>(() => {}));
  return $.ui.mount({
    plugin: "kit",
    surface: "terminal",
    component: "AbovePrompt",
    props: { hasSurvey: false } as never,
  });
}

test("an effort picked in the band is locked until Auto unlocks it", async ($, on) => {
  const w = world(on, { model: "claude-haiku-5-5", label: QUESTION, drawn: true });
  const ui = await band($, on);
  await ui.press({ key: "kit-effort" });
  await ui.press({ key: "kit-effort-high" });
  expect(w.store.effortLock).toBe("high");
  expect((await ui.find({ key: "kit-effort" }))?.text).toBe("◐ high ▪");
  await ui.press({ key: "kit-effort" });
  await ui.press({ key: "kit-effort-auto" });
  expect(w.store.effortLock).toBe(undefined);
});

test("the band's model switch clears first when asked, and keeps the switch", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: QUESTION,
    turns: 5,
    drawn: true,
  });
  const ui = await band($, on);
  await ui.press({ key: "kit-model" });
  await ui.press({ key: "kit-model-claude-opus-5-5" });
  await ui.press({ key: "kit-way-clear" });
  expect(w.cleared).toEqual(["clear"]);
  expect(w.store.switches).toEqual({
    s1: { chosen: "claude-opus-5-5", base: "claude-haiku-5-5" },
  });
  expect((await ui.find({ key: "kit-model" }))?.text).toBe("◆ Opus 5.5");
});

test("clear in the band asks once more before it clears", async ($, on) => {
  const w = world(on, { model: "claude-haiku-5-5", label: QUESTION, drawn: true });
  const ui = await band($, on);
  await ui.press({ key: "kit-clear" });
  expect(w.cleared).toEqual([]);
  await ui.press({ key: "kit-confirm-yes" });
  expect(w.cleared).toEqual(["clear"]);
});

test("Commit in the band starts /kit:commit", async ($, on) => {
  world(on, { model: "claude-haiku-5-5", label: QUESTION, drawn: true });
  const ran: string[] = [];
  on("command.run", { command: "kit:commit" }, async () => {
    ran.push("kit:commit");
    return { text: "" };
  });
  const ui = await band($, on);
  await ui.press({ key: "kit-commit" });
  expect(ran).toEqual(["kit:commit"]);
});
