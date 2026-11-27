import type { On } from "claude-code";
import { expect, test, type TestBody } from "claude-code/testing";

import { stop, write } from "./flow-fixture";

type T$ = Parameters<TestBody>[0];

// kit's mod is loaded around the test; these hooks answer what is beneath it. No git, so flow
// goes by tool calls. Turns are counted by the mod from turn.start.
function world(
  on: On,
  o: {
    tokens?: number;
    window?: number;
    fail?: string;
    late?: boolean;
    slow?: boolean; // core takes 100 ms to summarize
  } = {},
) {
  const s = {
    store: {} as Record<string, unknown>,
    compacts: 0,
    waits: [] as number[],
    commands: [] as string[],
    toasts: [] as string[],
    tokens: o.tokens ?? 120_000,
    fail: o.fail,
    onCompact: undefined as (() => Promise<unknown>) | undefined,
  };
  on("session.id", async () => ({ value: "s1" }));
  on("clock.now", async () => ({ value: Date.parse("2026-11-25T12:00:00Z") }));
  // Resolving fires the timer: at once, or 50 ms later for a race.
  on("clock.after", (_$, e) => (
    s.waits.push((e as { ms: number }).ms),
    o.late
      ? new Promise((r) => setTimeout(() => r({ value: undefined }), 50))
      : Promise.resolve({ value: undefined })
  ));
  on("session.root", async () => ({ value: "/p/app" }));
  // The transcript's count drops after a compaction: the mod must not rely on it.
  on("session.turns", async () => ({ value: 1 }));
  on("turn.start", async (_$, e) => ({ turnId: e.turnId }));
  on("session.usage", async () => ({
    value: {
      startedAt: 0,
      context: { window: o.window ?? 200_000, tokens: s.tokens, percent: 50 },
      rateLimits: [],
    },
  }));
  on("ui.log", async () => ({ value: undefined }));
  on("ui.invalidate", async () => ({ value: undefined }));
  on("ui.toast", async (_$, e) => {
    s.toasts.push(String((e as { text?: string }).text ?? JSON.stringify(e)));
    return { value: undefined };
  });
  on("classic.Stop", async () => ({}));
  on("turn.complete", async () => ({ text: "" }));
  on("process.run", async () => ({
    value: {
      exitCode: 1,
      stdout: "",
      stderr: "",
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));
  on("fs.read", async () => {
    throw new Error("missing");
  });
  on("store.get", async (_$, e) => ({ value: s.store[e.key] }));
  on("store.set", async (_$, e) => {
    s.store[e.key] = e.value;
    return { value: undefined };
  });
  on("tool.call", { tool: ["Edit", "Write"] }, async () => ({
    result: { type: "update" },
  }));
  // Per name: the test engine refuses an unmatched command as unknown.
  on("command.run", { command: "compact" }, async () => {
    s.commands.push("compact");
    if (s.fail) throw new Error(s.fail);
    s.compacts += 1;
    await s.onCompact?.();
    return { text: "" };
  });
  on("session.compact", async () => ({
    ...(o.slow ? await new Promise((r) => setTimeout(() => r({}), 100)) : {}),
    messages: [
      { role: "user" as const, text: "summary", toolUses: [], handle: "s" },
    ],
    tokensBefore: 120_000,
    tokensAfter: 15_000,
  }));
  return s;
}

const MSGS = [{ role: "user", text: "Fix it", toolUses: [], handle: "u1" }];
const settle = () => new Promise((r) => setTimeout(r, 20)); // the timer's work runs after the hook
let ids = 0;
const begin = ($: T$) =>
  $.turn.start({ text: "x", turnId: `t${(ids += 1)}` } as never);
const answered = async ($: T$, extra: Record<string, unknown> = {}) => {
  await $.turn.complete({ answer: "Done.", reason: "answer", ...extra } as never);
  await settle();
};
// One main-chat turn: it starts, flow sees its end, then the turn completes.
async function turn($: T$, last = "Done.", extra: Record<string, unknown> = {}) {
  await begin($);
  const held = await stop($, last);
  await answered($, extra);
  return held;
}
// Module state can outlive a test: run past any cooldown first.
async function fresh($: T$) {
  for (let i = 0; i < 3; i += 1) await begin($);
}
const auto = ($: T$, args: string) =>
  $.command.run({ command: "kitcompact", args } as never) as Promise<{
    text?: string;
  }>;
const compact = ($: T$, trigger: string) =>
  $.session.compact({ trigger, messages: MSGS, instructions: "" } as never);
const ledger = (s: { store: Record<string, unknown> }) =>
  ((s.store["kit:context-ledger"] ?? {}) as Record<string, unknown[]>)["/p/app"] ??
  [];

test("a closed turn over the threshold compacts after 3 idle minutes", async ($, on) => {
  const s = world(on);
  await fresh($);
  expect((await turn($)).block).toBe(undefined);
  expect(s.compacts).toBe(1);
  expect(s.waits.at(-1)).toBe(3 * 60_000);
  expect(s.toasts.join(" ")).toContain("task done, idle 3 min");
});

test("a turn that ends on a question compacts only after 10 idle minutes", async ($, on) => {
  const s = world(on);
  for (const last of ["Zal ik het bouwen?", "**Zal ik het bouwen?**", "Akkoord? (ja/nee)"]) {
    await fresh($);
    const before = s.compacts;
    await turn($, last);
    expect(s.compacts).toBe(before + 1);
    expect(s.waits.at(-1)).toBe(10 * 60_000);
  }
  expect(s.toasts.join(" ")).toContain("work waits on you, idle 10 min");
});

test("an open task let through unverified compacts after the longer idle wait", async ($, on) => {
  const s = world(on);
  await fresh($);
  await begin($);
  await write($, "/p/app/src/a.ts");
  expect((await stop($)).block).toBeDefined(); // the first hold: the turn goes on
  expect((await stop($)).block).toBe(undefined); // the same round again: let through, still open
  await answered($);
  expect(s.compacts).toBe(1);
  expect(s.waits.at(-1)).toBe(10 * 60_000);
});

test("below the threshold, an aborted or errored turn, a subagent: no compact", async ($, on) => {
  const s = world(on, { tokens: 99_000 });
  await fresh($);
  await turn($);
  expect(s.compacts).toBe(0); // below half of 200k
  s.tokens = 150_000;
  await turn($, "Done.", { reason: "aborted" });
  await turn($, "Done.", { reason: "error" });
  expect(s.compacts).toBe(0);
  await begin($);
  await stop($);
  await answered($, { agentId: "a1" }); // a subagent's completion leaves the boundary alone
  expect(s.compacts).toBe(0);
  await answered($); // the main turn's completion uses it
  expect(s.compacts).toBe(1);
});

test("a subagent's Stop notes no boundary", async ($, on) => {
  const s = world(on);
  await fresh($);
  await begin($);
  await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: "Done.",
    background_tasks: [],
    agent_id: "a1",
  } as never);
  await answered($);
  expect(s.compacts).toBe(0);
});

test("a turn flow holds is no boundary", async ($, on) => {
  const s = world(on);
  await fresh($);
  await begin($);
  await write($, "/p/app/src/a.ts");
  expect((await stop($)).block).toBeDefined(); // flow holds: no check yet
  await answered($);
  expect(s.compacts).toBe(0);
});

test("every compaction lands in the ledger; the cooldown counts the mod's own turns", async ($, on) => {
  const s = world(on);
  await fresh($);
  await compact($, "auto");
  expect(ledger(s).at(-1)).toEqual(
    expect.objectContaining({ trigger: "auto", kit: false, before: 120_000, after: 15_000 }),
  );
  await turn($); // one and two turns after it: within the cooldown
  await turn($);
  expect(s.compacts).toBe(0);
  s.onCompact = () => compact($, "manual"); // kit's /compact runs the native compaction
  await turn($);
  expect(s.compacts).toBe(1);
  expect(ledger(s).at(-1)).toEqual(expect.objectContaining({ kit: true }));
  expect(String((await auto($, "status")).text)).toContain("kit 120k → 15k");
  s.onCompact = undefined;
  await turn($); // still over the threshold right after kit's own compaction: no second one
  expect(s.compacts).toBe(1);
  await compact($, "manual"); // one the user started is not marked as kit's
  expect(ledger(s).at(-1)).toEqual(expect.objectContaining({ kit: false }));
});

test("a skipped compaction is reported, starts no cooldown and marks nothing as kit's", async ($, on) => {
  const s = world(on); // the compact command runs, no compaction follows
  await fresh($);
  await turn($);
  expect(s.compacts).toBe(1);
  expect(s.toasts.at(-1)).toContain("auto-compact did not run");
  await turn($); // no cooldown: the next idle turn tries again
  expect(s.compacts).toBe(2);
  await compact($, "auto");
  expect(ledger(s).at(-1)).toEqual(expect.objectContaining({ kit: false }));
});

for (const how of ["edit", "change"] as const)
  test(`typing in the prompt box before the planned compact fires cancels it (${how})`, async ($, on) => {
    const s = world(on, { late: true });
    on(`prompt.${how}`, async (_$, e) => e as never);
    await fresh($);
    await begin($);
    await stop($);
    await $.turn.complete({ answer: "Done.", reason: "answer" } as never);
    await ($.prompt as unknown as Record<string, (e: unknown) => Promise<unknown>>)
      [how]({ text: "j", cursor: 1, start: 0, end: 0, inputText: "j", origin: { kind: "history" } })
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 120));
    expect(s.compacts).toBe(0);
  });

test("a prompt queued during the turn voids its boundary", async ($, on) => {
  const s = world(on);
  await fresh($);
  await begin($);
  await $.prompt
    .submit({ text: "and then this", origin: { kind: "composer" } } as never)
    .catch(() => undefined);
  await stop($);
  await answered($);
  expect(s.compacts).toBe(0);
});

test("a prompt before the planned compact fires cancels it", async ($, on) => {
  const s = world(on, { late: true });
  await fresh($);
  await begin($);
  await stop($);
  await $.turn.complete({ answer: "Done.", reason: "answer" } as never);
  await $.prompt
    .submit({ text: "next question", origin: { kind: "composer" } } as never)
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 120));
  expect(s.compacts).toBe(0);
});

test("/kitcompact off stops it for the project, on restores it", async ($, on) => {
  const s = world(on);
  await fresh($);
  expect(String((await auto($, "off")).text)).toContain("autocompact: off");
  expect(s.store["kit:autocompact"]).toEqual({ "/p/app": true });
  await turn($);
  expect(s.compacts).toBe(0);
  expect(String((await auto($, "on")).text)).toContain("autocompact: on");
  await turn($);
  expect(s.compacts).toBe(1);
  expect(String((await auto($, "status")).text)).toContain("threshold 100k");
});

// A thrown test hook reaches the mod as "unknown command", so the busy skip is unit-tested in
// context-policy.test.ts (isBusy).
test("a failing compact turns it off with one toast; /kitcompact on clears that", async ($, on) => {
  const s = world(on, { fail: "unknown command" });
  await fresh($);
  await turn($);
  expect(s.toasts.filter((t) => t.includes("could not run")).length).toBe(1);
  s.fail = undefined;
  await fresh($);
  await turn($);
  expect(s.compacts).toBe(0); // off for this chat
  expect(String((await auto($, "status")).text)).toContain("compact failed");
  await auto($, "on");
  await turn($);
  expect(s.compacts).toBe(1);
});

test("a turn that starts without a prompt before the compact fires cancels it", async ($, on) => {
  const s = world(on, { late: true });
  await fresh($);
  await begin($);
  await stop($);
  await $.turn.complete({ answer: "Done.", reason: "answer" } as never);
  await begin($); // a continuation: no prompt.submit
  await new Promise((r) => setTimeout(r, 120));
  expect(s.compacts).toBe(0);
});

test("/kitcompact off before the planned compact fires cancels it", async ($, on) => {
  const s = world(on, { late: true });
  await fresh($);
  await begin($);
  await stop($);
  await $.turn.complete({ answer: "Done.", reason: "answer" } as never);
  await auto($, "off");
  await new Promise((r) => setTimeout(r, 120));
  expect(s.compacts).toBe(0);
  await auto($, "on");
});

test("background work still running is no boundary", async ($, on) => {
  const s = world(on);
  await fresh($);
  await begin($);
  await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: "Done.",
    background_tasks: [{ id: "b1" }],
  } as never);
  await answered($);
  expect(s.compacts).toBe(0);
});

test("the ledger keeps the last 50 compactions; precompute adds none", async ($, on) => {
  const s = world(on);
  for (let i = 0; i < 55; i += 1) await compact($, "auto");
  await compact($, "precompute");
  expect(ledger(s).length).toBe(50);
  expect(ledger(s).every((r) => (r as { trigger: string }).trigger === "auto")).toBe(true);
});

// Claude Code has its own /autocompact: registering that name is refused, and a hook on it
// answers in the built-in's place.
test("kit leaves the built-in /autocompact alone", async ($, on) => {
  on("command.run", async () => ({ text: "the built-in" }));
  const r = await $.command.run({ command: "autocompact", args: "status" } as never);
  expect((r as { text: string }).text).toBe("the built-in");
});

test("the ledger and /kitcompact status say what came back after a compaction", async ($, on) => {
  const s = world(on);
  await compact($, "manual");
  expect(ledger(s).at(-1)).toEqual(
    expect.objectContaining({
      notes: { restored: expect.any(Array), cut: [], failed: [] },
    }),
  );
  expect((await auto($, "status")).text).toContain("· restored: ");
  expect(s.toasts.some((t) => t.startsWith("kit: compacted 120k → 15k"))).toBe(true);
});

test("a compaction still running when the planned compact fires cancels it", async ($, on) => {
  const s = world(on, { late: true, slow: true });
  await fresh($);
  await begin($);
  await stop($);
  await $.turn.complete({ answer: "Done.", reason: "answer" } as never);
  await compact($, "plugin"); // the timer fires 50 ms in, core is done at 100 ms
  await new Promise((r) => setTimeout(r, 120));
  expect(s.compacts).toBe(0);
});

test("a draft typed while the turn runs keeps its boundary", async ($, on) => {
  const s = world(on);
  on("prompt.edit", async (_$, e) => e as never);
  await fresh($);
  await begin($);
  await ($.prompt as unknown as Record<string, (e: unknown) => Promise<unknown>>)
    .edit({ text: "j", cursor: 1, start: 0, end: 0, inputText: "j" })
    .catch(() => undefined);
  await stop($);
  await answered($);
  expect(s.compacts).toBe(1);
});
