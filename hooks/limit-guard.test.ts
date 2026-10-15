import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
const NOW = Date.parse("2026-10-16T12:00:00Z");
const RESET = "2026-10-16T14:00:00Z";

function world(on: On) {
  const toasts: string[] = [];
  const entered: string[] = [];
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
  on("store.get", async () => ({ value: "off" })); // auto-model stays out of the way
  on("prompt.submit", async (_$, e) => {
    entered.push(e.text);
    return { text: e.text };
  });
  return { toasts, entered };
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
