import type { On } from "claude-code";
import { expect, test, type TestBody } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
const NOW = Date.parse("2026-10-16T12:00:00Z");
const RESET = "2026-10-16T14:00:00Z";

function world(on: On, holds?: Record<string, unknown>) {
  const toasts: string[] = [];
  const seen = { pingStopped: () => {}, toast: (_t: string) => {} };
  const entered: string[] = [];
  // How the prompt beneath answers a text: refuse it, fail, or hang.
  const beneath: Record<string, "drop" | "reject" | "hang"> = {};
  const store: Record<string, unknown> = { limitHold: holds };
  const clock = { now: NOW, tick: () => {} };
  const session = { id: "s1" };
  on("clock.now", async () => ({ value: clock.now }));
  // Long timers never fire by themselves: the pause holds until a test resumes it or fires the
  // keep-warm tick. A replay's zero-length timer fires at once.
  on("clock.after", (_$, e) =>
    e.ms === 0
      ? Promise.resolve({ value: undefined })
      : new Promise<never>(() => {}),
  );
  on(
    "clock.every",
    () =>
      new Promise<{ value: undefined }>((done) => {
        clock.tick = () => done({ value: undefined });
      }),
  );
  on("ui.toast", async (_$, e) => {
    toasts.push(String(e.text));
    if (String(e.text).includes("keep warm stopped")) seen.pingStopped();
    seen.toast(String(e.text));
    return { value: undefined };
  });
  on("ui.invalidate", async () => ({ value: undefined }));
  on("session.measure", async (_$, e) => ({ changed: e.changed }));
  on("session.id", async () => ({ value: session.id }));
  on("session.end", async () => ({ sessionId: session.id }));
  // auto-model stays out of the way; the limit hold is per session id
  on("store.get", async (_$, e) => ({
    value: e.key in store ? store[e.key] : "off",
  }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  const sent = { next: (_text: string) => {} };
  on("prompt.submit", async (_$, e) => {
    const how = beneath[e.text];
    if (how === "hang") return new Promise<never>(() => {});
    if (how === "drop") return { drop: "a hook said no" };
    if (how === "reject") throw new Error("host limit reached");
    entered.push(e.text);
    sent.next(e.text);
    return { text: e.text };
  });
  // Resolve once `text` entered, or once a toast says `part`.
  const arrives = (text: string) =>
    new Promise<void>((done) => {
      if (entered.includes(text)) return done();
      sent.next = (t) => t === text && done();
    });
  const says = (part: string) =>
    new Promise<void>((done) => {
      if (toasts.some((t) => t.includes(part))) return done();
      seen.toast = (t) => t.includes(part) && done();
    });
  return { toasts, entered, store, clock, session, seen, beneath, arrives, says };
}
const measure = (percentUsed: number) =>
  ({
    context: { percent: 10, tokens: 20_000 },
    rateLimits: [{ kind: "five_hour", percentUsed, resetsAt: RESET }],
    changed: ["rateLimits"],
  }) as never;
const TYPED = { text: "next step", origin: { kind: "composer" }, wait: false } as const;

test("under the pause point prompts go through", async ($, on) => {
  const w = world(on, { s1: "pause" });
  await $.session.measure(measure(80));
  const r = await $.prompt.submit(TYPED);
  expect(r.drop).toBe(undefined);
  expect(w.entered).toEqual(["next step"]);
});

test("near the limit the chat pauses and keeps new prompts for the reset", async ($, on) => {
  const w = world(on, { s1: "pause" });
  await $.session.measure(measure(97));
  expect(w.toasts.some((t) => t.includes("paused until"))).toBe(true);
  const r = await $.prompt.submit(TYPED);
  expect(r.drop ?? "").toContain("this prompt is sent at");
  expect(w.entered).toEqual([]);
});

// Only the Limit hold pauses: Off (the default) and Warm keep the chat going (b6ac523).
for (const hold of ["off", "warm"])
  test(`a chat with the limit button on ${hold} never pauses`, async ($, on) => {
    const w = world(on, { s1: hold });
    await $.session.measure(measure(97));
    expect(w.toasts.some((t) => t.includes("paused until"))).toBe(false);
    const r = await $.prompt.submit(TYPED);
    expect(r.drop).toBe(undefined);
  });

test("/warm keeps the hold with keep warm for this chat", async ($, on) => {
  const w = world(on);
  await $.command.run({ command: "warm", args: "on" } as never);
  expect(w.store.limitHold).toEqual({ s1: "warm" });
  await $.command.run({ command: "warm", args: "off" } as never);
  expect(w.store.limitHold).toEqual({ s1: "off" });
});

test("a failed keep-warm ping drops Warm to Off, not to Limit", async ($, on) => {
  const w = world(on);
  on("model.fork", async () => ({
    value: { isAnswered: false, reason: "api-error" },
  }) as never);
  await $.command.run({ command: "warm", args: "on" } as never);
  await $.session.measure(measure(50)); // the cache was renewed now
  w.clock.now = NOW + 51 * 60_000;
  const stopped = new Promise<void>((done) => (w.seen.pingStopped = done));
  w.clock.tick();
  await stopped;
  await $.session.measure(measure(50)); // reads the chat's hold again
  expect(w.store.limitHold).toEqual({ s1: "off" });
});

for (const reason of ["clear", "resume"])
  test(`${reason} during a pause ends it and drops the kept prompts, saying so`, async ($, on) => {
    const w = world(on, { s1: "pause" });
    await $.session.measure(measure(97));
    await $.prompt.submit(TYPED);
    await $.session.end({ reason } as never);
    w.session.id = "s2";
    expect(w.toasts.some((t) => t.includes("1 kept prompt dropped"))).toBe(true);
    const r = await $.prompt.submit({ ...TYPED, text: "fresh chat" });
    expect(r.drop).toBe(undefined);
    const r2 = await $.command.run({ command: "limit", args: "" } as never);
    expect(r2.text ?? "").toContain("0 kept");
    expect(w.entered).toEqual(["fresh chat"]);
  });

const END = { command: "warm", args: "on" } as never; // any hold but Limit ends a pause
const TWO = [TYPED, { ...TYPED, text: "and then" }];

async function pausedWithTwo($: Parameters<TestBody>[0]) {
  await $.session.measure(measure(97));
  for (const p of TWO) await $.prompt.submit(p);
}

test("the kept prompts enter in order after the pause", async ($, on) => {
  const w = world(on, { s1: "pause" });
  await pausedWithTwo($);
  await $.command.run(END);
  await w.arrives("and then");
  expect(w.entered).toEqual(["next step", "and then"]);
});

for (const how of ["drop", "reject"] as const)
  test(`a kept prompt that meets a ${how} stays kept, with the ones behind it, and says so`, async ($, on) => {
    const w = world(on, { s1: "pause" });
    await pausedWithTwo($);
    w.beneath["next step"] = how;
    await $.command.run(END);
    await w.says("2 prompts still kept");
    expect(w.entered).toEqual([]);
    delete w.beneath["next step"];
    await $.command.run(END); // tries again
    await w.arrives("and then");
    expect(w.entered).toEqual(["next step", "and then"]);
  });

test("no command waits on the kept prompts", async ($, on) => {
  const w = world(on, { s1: "pause" });
  await pausedWithTwo($);
  w.beneath["next step"] = "hang";
  const r = await $.command.run(END);
  expect(r.text ?? "").toContain("Keep warm on");
});

test("a clear drops a prompt a failed send left behind", async ($, on) => {
  const w = world(on, { s1: "pause" });
  await pausedWithTwo($);
  w.beneath["next step"] = "drop";
  await $.command.run(END);
  await w.says("2 prompts still kept");
  await $.session.end({ reason: "clear" } as never);
  w.session.id = "s2";
  expect(w.toasts.some((t) => t.includes("2 kept prompts dropped"))).toBe(true);
  const r = await $.command.run({ command: "limit", args: "" } as never);
  expect(r.text ?? "").toContain("0 kept");
});

test("a failed ping sends nothing that was kept", async ($, on) => {
  const w = world(on, { s1: "pause" });
  on("model.fork", async () => ({ value: { isAnswered: false, reason: "api-error" } }) as never);
  await pausedWithTwo($);
  w.beneath["next step"] = "drop";
  await $.command.run(END);
  await w.says("2 prompts still kept");
  delete w.beneath["next step"];
  await $.session.measure(measure(50));
  w.clock.now = NOW + 51 * 60_000;
  const stopped = new Promise<void>((done) => (w.seen.pingStopped = done));
  w.clock.tick();
  await stopped;
  await $.session.measure(measure(50)); // reads the hold again: Off now
  const r = await $.command.run({ command: "limit", args: "" } as never);
  expect(r.text ?? "").toContain("2 kept, not sent");
  expect(w.entered).toEqual([]);
});
