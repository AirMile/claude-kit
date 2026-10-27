import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
const NOW = Date.parse("2026-10-16T12:00:00Z");
const RESET = "2026-10-16T14:00:00Z";

function world(on: On, holds?: Record<string, unknown>) {
  const toasts: string[] = [];
  const entered: string[] = [];
  const store: Record<string, unknown> = { limitHold: holds };
  on("clock.now", async () => ({ value: NOW }));
  // Timers never fire here: the pause holds for the whole test.
  on("clock.after", () => new Promise<never>(() => {}));
  on("clock.every", () => new Promise<never>(() => {}));
  on("ui.toast", async (_$, e) => {
    toasts.push(String(e.text));
    return { value: undefined };
  });
  on("ui.invalidate", async () => ({ value: undefined }));
  on("session.measure", async (_$, e) => ({ changed: e.changed }));
  on("session.id", async () => ({ value: "s1" }));
  // auto-model stays out of the way; the limit hold is per session id
  on("store.get", async (_$, e) => ({
    value: e.key in store ? store[e.key] : "off",
  }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("prompt.submit", async (_$, e) => {
    entered.push(e.text);
    return { text: e.text };
  });
  return { toasts, entered, store };
}
const measure = (percentUsed: number) =>
  ({
    context: { percent: 10, tokens: 20_000 },
    rateLimits: [{ kind: "five_hour", percentUsed, resetsAt: RESET }],
    changed: ["rateLimits"],
  }) as never;
const TYPED = { text: "next step", origin: { kind: "composer" }, wait: false } as const;

test("under the pause point prompts go through", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure(80));
  const r = await $.prompt.submit(TYPED);
  expect(r.drop).toBe(undefined);
  expect(w.entered).toEqual(["next step"]);
});

test("near the limit the chat pauses and keeps new prompts for the reset", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure(97));
  expect(w.toasts.some((t) => t.includes("paused until"))).toBe(true);
  const r = await $.prompt.submit(TYPED);
  expect(r.drop ?? "").toContain("this prompt is sent at");
  expect(w.entered).toEqual([]);
});

test("a chat with the limit button off never pauses", async ($, on) => {
  const w = world(on, { s1: "off" });
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
  expect(w.store.limitHold).toEqual({ s1: "pause" });
});
