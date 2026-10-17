import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
function world(
  on: On,
  opts: {
    model: string;
    label: string;
    answer?: string;
    labels?: string[]; // classifier answers in order, then `label`
    turns?: number;
    percent?: number;
    store?: Record<string, unknown>;
    drawn?: true; // a mounted band redraws on ui.invalidate: leave it to the engine
  },
) {
  const asked: string[] = [];
  const offered: string[] = [];
  const sent: { text: string; origin: unknown; context?: readonly string[] }[] =
    [];
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
  const queue = [...(opts.labels ?? [])];
  on("model.classify", async () => ({ value: queue.shift() ?? opts.label }));
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
    sent.push({ text: e.text, origin: e.origin, context: e.context });
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

test("two tiers short asks; a subagent keeps the model and rides along as a note", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 10,
    answer: "Ask a Opus 5.5 subagent (Recommended)",
  });
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  await $.prompt.submit({ text: "and the billing layer", origin: TYPED });
  expect(w.asked.length).toBe(1); // the choice holds for the chat
  expect(w.offered[0]).toContain("Switch to Opus 5.5 now");
  expect(w.store.switches).toBeUndefined();
  expect(w.sent.map((s) => s.text)).toEqual([
    "refactor the auth layer",
    "and the billing layer",
  ]);
  for (const s of w.sent)
    expect(String(s.context)).toContain('model "opus"');
});

test("a full context offers no switch now; staying is not asked again", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 60,
    answer: "Stay on Haiku 5.5 at high effort",
  });
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  await $.prompt.submit({ text: "and the billing layer", origin: TYPED });
  expect(w.asked.length).toBe(1);
  expect(w.offered[0]).not.toContain("now");
  expect(w.sent.length).toBe(2);
});

test("clear, then switch: the prompt is held, the chat cleared, and sent again", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 60,
    answer: "Clear, then Opus 5.5",
  });
  const r = await $.prompt.submit({
    text: "refactor the auth layer",
    origin: TYPED,
  });
  expect(String((r as { drop?: string }).drop)).toContain("clearing");
  await settle();
  expect(w.cleared).toEqual(["clear"]);
  expect(w.sent.map((s) => s.text)).toEqual(["refactor the auth layer"]);
  expect(w.store.switches).toEqual({
    s1: { chosen: "claude-opus-5-5", base: "claude-haiku-5-5" },
  });
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
    store: {
      switches: { s1: { chosen: "claude-opus-5-5", base: "claude-haiku-5-5" } },
    },
  });
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  expect(w.asked).toEqual([]);
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

test("with Auto off the band's effort holds until Default; with Auto on it hides", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: QUESTION,
    drawn: true,
    store: { mode: "off" },
  });
  const ui = await band($, on);
  expect((await ui.find({ key: "kit-run" }))?.text).toBe("Haiku 5.5");
  await ui.press({ key: "kit-effort" });
  await ui.press({ key: "kit-effort-high" });
  expect(w.store.effortLock).toBe("high");
  expect((await ui.find({ key: "kit-effort" }))?.text).toBe("high");
  await ui.press({ key: "kit-effort" });
  await ui.press({ key: "kit-effort-default" });
  expect(w.store.effortLock).toBe(undefined);
  await ui.press({ key: "kit-run" });
  await ui.press({ key: "kit-mode-balanced" });
  expect(await ui.find({ key: "kit-effort" })).toBeFalsy();
  expect((await ui.find({ key: "kit-run" }))?.text).toContain("Auto · Haiku 5.5");
});

test("a thin reply keeps the effort of the work it continues", async ($, on) => {
  world(on, {
    model: "claude-opus-5-5",
    label: HEAVY,
    labels: [HEAVY, QUESTION, QUESTION],
    turns: 5,
    drawn: true,
  });
  const ui = await band($, on);
  const shown = async () =>
    (await ui.find({ key: "kit-run" }))?.text?.split(" · ").at(-1);
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  expect(await shown()).toBe("xhigh");
  await $.prompt.submit({ text: "ja", origin: TYPED });
  expect(await shown()).toBe("xhigh");
  await $.prompt.submit({
    text: "what does the importer do on retries",
    origin: TYPED,
  });
  expect(await shown()).toBe("low");
});

test("/build runs at high, a plain heavy prompt at xhigh", async ($, on) => {
  world(on, { model: "claude-opus-5-5", label: HEAVY, turns: 5, drawn: true });
  const ui = await band($, on);
  await $.prompt.submit({ text: "/build login-form", origin: TYPED });
  expect((await ui.find({ key: "kit-run" }))?.text).toBe("Auto · Opus 5.5 · high");
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  expect((await ui.find({ key: "kit-run" }))?.text).toBe("Auto · Opus 5.5 · xhigh");
});

test("clear behind the band's context figure clears just after the press", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: QUESTION,
    drawn: true,
  });
  const ui = await band($, on);
  await ui.press({ key: "kit-ctx" });
  await ui.press({ key: "kit-clear" });
  await settle();
  expect(w.cleared).toEqual(["clear"]);
});

test("Commit, first in the band's Git menu, starts /kit:commit", async ($, on) => {
  world(on, { model: "claude-haiku-5-5", label: QUESTION, drawn: true });
  const ran: string[] = [];
  on("command.run", { command: "kit:commit" }, async () => {
    ran.push("kit:commit");
    return { text: "" };
  });
  const ui = await band($, on);
  await ui.press({ key: "kit-git" });
  await ui.press({ key: "kit-git-Commit" });
  expect(ran).toEqual(["kit:commit"]);
});

test("the band's Git menu sends its item as a prompt", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: QUESTION,
    drawn: true,
  });
  const ui = await band($, on);
  await ui.press({ key: "kit-git" });
  await ui.press({ key: "kit-git-Push" });
  expect(w.sent.map((m) => m.text)).toEqual([
    "Push the current branch to origin.",
  ]);
});

test("Orchestrate adds a note by kind of work: none for a question", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: HEAVY,
    turns: 5,
    store: { orchestrate: true },
  });
  await $.prompt.submit({ text: "rebuild the importer", origin: TYPED });
  expect(String(w.sent[0]?.context)).toContain("kit orchestrate: split this");
});

test("Orchestrate leaves a question alone, and works with the profile off", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: QUESTION,
    turns: 5,
    store: { orchestrate: true, mode: "off" },
  });
  await $.prompt.submit({ text: "what does this do?", origin: TYPED });
  expect(w.sent[0]?.context ?? []).toEqual([]);
});

test("without Orchestrate a prompt carries no note", async ($, on) => {
  const w = world(on, { model: "claude-opus-5-5", label: HEAVY, turns: 5 });
  await $.prompt.submit({ text: "rebuild the importer", origin: TYPED });
  expect(w.sent[0]?.context ?? []).toEqual([]);
});

test("Orchestrate in the band's run menu turns it on and marks the run", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: QUESTION,
    drawn: true,
  });
  const ui = await band($, on);
  await ui.press({ key: "kit-run" });
  await ui.press({ key: "kit-orchestrate" });
  expect(w.store.orchestrate).toBe(true);
  expect((await ui.find({ key: "kit-run" }))?.text).toContain("⑂");
});
