import { expect, test } from "claude-code/testing";

import { gptIdle, newWindow, shouldPing } from "./window-sync-policy";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const MIN = 60_000;
const at = (min: number) => new Date(NOW + min * MIN).toISOString();

test("ChatGPT's window is idle at 0% with a reset reading as now + 5h, or one already past", () => {
  expect(gptIdle({ pct: 0, resetsAt: at(300) }, NOW)).toBe(true);
  expect(gptIdle({ pct: 0, resetsAt: at(299) }, NOW)).toBe(true);
  expect(gptIdle({ pct: 0, resetsAt: at(-5) }, NOW)).toBe(true);
  expect(gptIdle({ pct: 0 }, NOW)).toBe(true);
});

test("a fixed future reset is a running window, even at a rounded 0%", () => {
  expect(gptIdle({ pct: 0, resetsAt: at(240) }, NOW)).toBe(false);
  expect(gptIdle({ pct: 45, resetsAt: at(300) }, NOW)).toBe(false);
  expect(gptIdle(undefined, NOW)).toBe(false);
  expect(gptIdle({ pct: 0, resetsAt: "soon" }, NOW)).toBe(false);
});

test("a Claude window in use counts as new up to 30 minutes after it started", () => {
  // started 29 minutes ago: resets in 4h31m
  expect(newWindow({ pct: 3, resetsAt: at(271) }, NOW, undefined)).toBe(
    NOW - 29 * MIN,
  );
  expect(newWindow({ pct: 3, resetsAt: at(269) }, NOW, undefined)).toBe(
    undefined,
  );
  expect(newWindow({ pct: 0, resetsAt: at(290) }, NOW, undefined)).toBe(
    undefined,
  );
  expect(newWindow({ pct: 3 }, NOW, undefined)).toBe(undefined);
  expect(newWindow(undefined, NOW, undefined)).toBe(undefined);
});

test("a window is synced once: the stored start ends it, an older one does not", () => {
  const claude = { pct: 3, resetsAt: at(290) };
  const start = NOW - 10 * MIN;
  expect(newWindow(claude, NOW, start)).toBe(undefined);
  expect(newWindow(claude, NOW, start + 2 * MIN)).toBe(undefined);
  expect(newWindow(claude, NOW, start - 300 * MIN)).toBe(start);
});

test("a ping only for a new, unsynced Claude window while ChatGPT's is idle", () => {
  const claude = { pct: 3, resetsAt: at(290) };
  const idle = { pct: 0, resetsAt: at(300) };
  expect(
    shouldPing({
      claude,
      gpt: idle,
      gptReadAt: NOW,
      now: NOW,
      synced: undefined,
    }),
  ).toEqual({ ping: true, start: NOW - 10 * MIN });
  expect(
    shouldPing({
      claude,
      gpt: { pct: 12, resetsAt: at(100) },
      gptReadAt: NOW,
      now: NOW,
      synced: undefined,
    }),
  ).toEqual({ ping: false });
  expect(
    shouldPing({
      claude,
      gpt: idle,
      gptReadAt: NOW,
      now: NOW,
      synced: NOW - 10 * MIN,
    }),
  ).toEqual({ ping: false });
  expect(
    shouldPing({
      claude: undefined,
      gpt: idle,
      gptReadAt: NOW,
      now: NOW,
      synced: undefined,
    }),
  ).toEqual({ ping: false });
});
