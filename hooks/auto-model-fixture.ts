import type { On } from "claude-code";
import type { TestBody } from "claude-code/testing";
import { CHANGE_LABELS } from "./flow-policy";
import { VERIFY_LABELS } from "./task-policy";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
export function world(
  on: On,
  opts: {
    model: string;
    label: string;
    answer?: string;
    labels?: string[]; // classifier answers in order, then `label`
    change?: string; // flow's change classifier answer
    verify?: string; // task-policy's verify classifier answer (default: behaviour)
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
    value: {
      startedAt: 0,
      context: { window: 200_000, percent: opts.percent },
      rateLimits: [],
    },
  }));
  on("clock.after", async () => ({ value: undefined }));
  on("clock.now", async () => ({ value: Date.parse("2026-10-27T12:00:00Z") }));
  on("ui.toast", async () => ({ value: undefined }));
  on("command.run", { command: "clear" }, async () => {
    cleared.push("clear");
    return { text: "" };
  });
  const queue = [...(opts.labels ?? [])];
  on("model.classify", async (_$, e) => ({
    value: e.labels.includes(CHANGE_LABELS.none)
      ? opts.change
      : e.labels.includes(VERIFY_LABELS.cosmetic)
        ? (opts.verify ?? VERIFY_LABELS.behaviour)
        : (queue.shift() ?? opts.label),
  }));
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
  on("ui.log", async () => ({ value: undefined }));
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
  on("classic.SessionStart", async () => ({}));
  return { asked, offered, sent, cleared, store };
}
// The model and effort the band shows beside the profile.
// The effort between ‹ and › (a Text is found by its text, not its key).
export async function effortLevel(ui: {
  find: (q: object) => Promise<{ text?: string } | undefined>;
}) {
  const levels = /^ (default|▂|▄|▆|▇|█) $/;
  return (await ui.find({ type: "Text", text: levels }))?.text;
}

// The model and, before it, the profile's effort or the effort set by hand.
export async function runText(ui: {
  find: (q: object) => Promise<{ text?: string } | undefined>;
}) {
  const model = (await ui.find({ type: "Text", text: /\d\.\d/ }))?.text;
  const level = (await effortLevel(ui))?.trim();
  return level && level !== "default" ? `${level} ${model}` : model;
}

// The band as the terminal draws it; a press acts as a click does.
export function band($: Parameters<TestBody>[0], on: On) {
  on("ui.panes", async () => ({ value: [] }));
  on("clock.every", () => new Promise<never>(() => {}));
  return $.ui.mount({
    plugin: "kit",
    surface: "terminal",
    component: "AbovePrompt",
    props: { hasSurvey: false } as never,
  });
}
