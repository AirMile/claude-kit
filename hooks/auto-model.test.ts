import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
function world(
  on: On,
  opts: { model: string; label: string; answer?: string },
) {
  const asked: string[] = [];
  const status: (string | undefined)[] = [];
  const store: Record<string, unknown> = {};
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.model", async () => ({ value: opts.model }));
  on("session.turns", async () => ({ value: 0 }));
  on("model.classify", async () => ({ value: opts.label }));
  // $.ui.ask is a tool.call of AskUserQuestion beneath; answered by question text.
  on("tool.call", { tool: "AskUserQuestion" }, async (_$, e) => {
    const { questions } = e as unknown as { questions: { question: string }[] };
    const question = questions[0].question;
    asked.push(question);
    if (!opts.answer) return { deny: "dismissed" };
    return { result: { questions, answers: { [question]: opts.answer } } };
  });
  on("ui.status", async (_$, e) => {
    status.push(e.text);
    return { value: undefined };
  });
  on("ui.invalidate", async () => ({ value: undefined }));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  on("classic.SessionStart", async () => ({ value: {} }));
  return { asked, status, store };
}
const TYPED = { kind: "composer" } as const;
const QUESTION =
  "question: explain, look something up, a short question or a one-line change";
const ROUTINE =
  "routine: write or change ordinary code, fix a clear bug, styling";

test("the first prompt asks to switch when the picked model differs", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: QUESTION,
    answer: "Switch to Haiku 5.5",
  });
  await $.prompt.submit({ text: "what does this function do?", origin: TYPED });
  await $.prompt.submit({ text: "and this one?", origin: TYPED });
  expect(w.asked.length).toBe(1); // only the first prompt picks a model
  expect(w.status.at(-1)).toBe("kit: Haiku 5.5 · low · Balanced");
});

test("no question when the session already runs the picked model", async ($, on) => {
  const w = world(on, { model: "claude-sonnet-5-5", label: ROUTINE });
  await $.prompt.submit({ text: "add a submit button", origin: TYPED });
  expect(w.asked).toEqual([]);
  expect(w.status.at(-1)).toBe("kit: Sonnet 5.5 · medium · Balanced");
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
