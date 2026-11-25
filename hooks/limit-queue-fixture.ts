import type { On, PromptSubmitInput } from "claude-code";

export const NOW = Date.parse("2026-10-16T12:00:00Z");
export const measure = (percentUsed = 97) => ({
  context: { percent: 10, tokens: 20_000 },
  rateLimits: [{ kind: "five_hour", percentUsed, resetsAt: "2026-10-16T14:00:00Z" }],
  changed: ["rateLimits"],
}) as never;
export const typed = (text = "next step") => ({
  text, origin: { kind: "composer" }, wait: false,
}) as const;
export const resume = { command: "limit", args: "resume" } as never;

// Only zero-length timers fire: replay runs, but the plan reset stays in the future.
export function world(on: On) {
  const store: Record<string, unknown> = { limitHold: { s1: "pause" }, mode: "off", gpt: false };
  const entered: PromptSubmitInput[] = [];
  const commands: { command: string; args: string }[] = [];
  const toasts: string[] = [];
  const asked: string[] = [];
  const state = {
    drop: false, reject: false, listFails: false, hangPrompt: false,
    sent: () => {}, ran: () => {}, said: () => {},
    finish: undefined as undefined | (() => void),
    blockCommand: false, turns: 0, session: "s1",
    // What a command does while it runs (a fork's subagent steps), and a held command lookup.
    during: undefined as undefined | (() => Promise<void>),
    lookup: undefined as undefined | Promise<void>, looking: () => {},
  };
  on("clock.now", async () => ({ value: NOW }));
  on("clock.after", (_$, e) => e.ms === 0
    ? Promise.resolve({ value: undefined }) : new Promise<never>(() => {}));
  on("clock.every", () => new Promise<never>(() => {}));
  on("session.id", async () => ({ value: state.session }));
  on("turn.complete", async () => ({ text: "" }));
  on("session.model", async () => ({ value: "claude-haiku-5-5" }));
  on("session.turns", async () => ({ value: state.turns }));
  on("model.classify", async () => ({ value: "heavy: large refactor, a stuck or hard bug, a long multi-step build" }));
  on("tool.call", { tool: "AskUserQuestion" }, async () => {
    asked.push("asked"); return { deny: "unattended" };
  });
  on("session.root", async () => ({ value: "/p/app" }));
  on("agent.spawn", async () => ({ model: "claude-haiku-5-5", agentId: "bg" }));
  on("session.end", async () => ({ sessionId: "s1" }));
  on("session.measure", async (_$, e) => ({ changed: e.changed }));
  on("session.usage", async () => ({ value: {
    rateLimits: [], context: { percent: 10, tokens: 20_000, breakdown: {
      skills: { skillFrontmatter: [
        { name: "simplify", source: "built-in" }, { name: "code-review", source: "built-in" },
      ] },
    } },
  } }) as never);
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("ui.invalidate", async () => ({ value: undefined }));
  on("ui.toast", async (_$, e) => {
    toasts.push(String(e.text)); state.said(); return { value: undefined };
  });
  on("command.list", async () => {
    if (state.listFails) throw new Error("lookup failed");
    state.looking();
    await state.lookup;
    return { value: [
      { name: "kit:commit", source: "plugin" },
      { name: "simplify", source: "builtin" },
      { name: "compact", source: "builtin" },
      { name: "my-prompt", source: "user" },
      { name: "debug", source: "builtin" },
      { name: "code-review", source: "builtin" },
      { name: "other:local", source: "plugin" },
    ] } as never;
  });
  on("command.run", { command: /^(kit:commit|simplify|my-prompt|code-review|compact|other:local)$/ }, async (_$, e) => {
    commands.push({ command: e.command, args: e.args }); state.ran();
    if (state.blockCommand) await new Promise<void>((done) => { state.finish = done; });
    await state.during?.();
    if (state.reject) throw new Error("unknown command");
    return {};
  });
  on("prompt.submit", async (_$, e) => {
    if (state.hangPrompt) return new Promise<never>(() => {});
    if (state.drop) return { drop: "downstream refused" };
    entered.push(e); state.sent(); return { text: e.text };
  });
  const arrives = () => new Promise<void>((done) => {
    if (entered.length) done(); else state.sent = done;
  });
  const runs = (n = 1) => new Promise<void>((done) => {
    const check = () => { if (commands.length >= n) done(); };
    state.ran = check; check();
  });
  const says = (part: string) => new Promise<void>((done) => {
    const check = () => { if (toasts.some((t) => t.includes(part))) done(); };
    state.said = check; check();
  });
  const sentCount = (n: number) => new Promise<void>((done) => {
    const check = () => { if (entered.length >= n) done(); };
    state.sent = check; check();
  });
  return { store, entered, commands, toasts, asked, state, arrives, runs, says, sentCount };
}
