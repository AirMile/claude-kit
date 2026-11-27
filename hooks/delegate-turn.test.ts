import { expect, test } from "claude-code/testing";

import { delegate, world } from "./delegate-fixture";
import { balancePick } from "./family-balance";
import { newTask } from "./flow-policy";

// With GPT and Gemini both on, an unasked review or second plan goes to whichever plan is used
// less (family-turn.ts); a switch that is off keeps its family out.
const AGY = {
  json: JSON.stringify({
    conversation_id: "c-1",
    status: "SUCCESS",
    response: "Conclusion: fine.",
  }),
};
const usage = (week: number, fiveHour: number) =>
  JSON.stringify({
    status: "SUCCESS",
    command: {
      name: "usage",
      data: {
        groups: [
          {
            buckets: [
              { id: "gemini-weekly", remaining_fraction: 1 - week / 100 },
              { id: "gemini-5h", remaining_fraction: 1 - fiveHour / 100 },
            ],
          },
        ],
      },
    },
  });
const gpt = (week: number, fiveHour: number) => ({
  argv: ["/bin/codex"],
  models: [{ id: "gpt-6.1-sol" }, { id: "gpt-6.2-astra" }],
  limits: {
    five_hour: { pct: fiveHour, resetsAt: "2026-10-27T16:00:00Z" },
    seven_day: { pct: week, resetsAt: "2026-10-31T16:00:00Z" },
  },
});
type World = ReturnType<typeof world>;
const ran = (w: World, bin: string) =>
  w.spawned.filter((s) => s.argv[0] === bin).length;
const REVIEW = { role: "review", brief: "Review the changes." };

test("the plan used less takes it: the week first, then the 5h window, close ones take turns", () => {
  const m = (wk: number, h: number) => ({
    seven_day: { pct: wk },
    five_hour: { pct: h },
  });
  expect(balancePick(m(40, 10), m(20, 50))).toBe("gemini");
  expect(balancePick(m(20, 50), m(40, 10))).toBe("gpt");
  expect(balancePick(m(30, 40), m(32, 10))).toBe("gemini");
  expect(balancePick(m(30, 10), m(32, 12), "gpt")).toBe("gemini");
  expect(balancePick(m(30, 10), m(32, 12), "gemini")).toBe("gpt");
  expect(balancePick(m(30, 10), undefined)).toBe("gpt");
  expect(balancePick({}, m(0, 0))).toBe("gpt");
});

test("ChatGPT's plan used more: a review goes to Gemini and the answer says why", async ($, on) => {
  const w = world(on, {
    status: gpt(40, 10),
    agy: AGY,
    agyUsage: usage(10, 5),
  });
  const out = await delegate($, { ...REVIEW, author: "claude" });
  expect(out).toContain("Gemini takes this review");
  expect(out).toContain("whose plan is used less");
  expect(ran(w, "/bin/codex")).toBe(0);
  expect(w.store.familyTurn).toBe("gemini");
});

test("Gemini's plan used more: the review stays on GPT", async ($, on) => {
  const w = world(on, { status: gpt(5, 1), agy: AGY, agyUsage: usage(50, 20) });
  await delegate($, REVIEW);
  expect(ran(w, "/bin/codex")).toBe(1);
  expect(w.store.familyTurn).toBe("gpt");
});

test("close plans take turns across delegations", async ($, on) => {
  const w = world(on, {
    status: gpt(20, 5),
    agy: AGY,
    agyUsage: usage(21, 6),
    store: { familyTurn: "gpt" },
  });
  const out = await delegate($, { role: "plan", brief: "Plan it." });
  expect(out).toContain("Gemini takes this plan");
  expect(w.store.familyTurn).toBe("gemini");
});

test("the Gemini switch off keeps everything on GPT, however its plan reads", async ($, on) => {
  const w = world(on, {
    status: gpt(80, 50),
    agy: AGY,
    agyUsage: usage(0, 0),
    store: { gemini: false },
  });
  await delegate($, REVIEW);
  expect(ran(w, "/bin/codex")).toBe(1);
  expect(ran(w, "/bin/agy")).toBe(0);
});

test("without Gemini's reading the review stays on GPT", async ($, on) => {
  const w = world(on, { status: gpt(80, 50), agy: AGY });
  await delegate($, REVIEW);
  expect(ran(w, "/bin/codex")).toBe(1);
  expect(ran(w, "/bin/agy")).toBe(0);
});

test("a review of GPT's code goes to Gemini instead of a Claude reviewer", async ($, on) => {
  const w = world(on, { status: gpt(5, 1), agy: AGY, agyUsage: usage(50, 20) });
  const out = await delegate($, { ...REVIEW, author: "gpt" });
  expect(out).toContain("GPT wrote this code: Gemini reviews it");
  expect(ran(w, "/bin/agy")).toBe(1);
});

test("a V3 review and a named GPT model stay on GPT", async ($, on) => {
  on("session.id", async () => ({ value: "s1" }));
  const task = {
    ...newTask(Date.parse("2026-10-27T12:00:00Z"), "heavy"),
    gateV: 3,
  };
  const w = world(on, {
    status: gpt(80, 50),
    agy: AGY,
    agyUsage: usage(0, 0),
    store: { flowTasks: { s1: task } },
  });
  await delegate($, REVIEW);
  await delegate($, { ...REVIEW, family: "sol" });
  await delegate($, { ...REVIEW, provider: "gpt" });
  expect(ran(w, "/bin/codex")).toBe(3);
  expect(ran(w, "/bin/agy")).toBe(0);
});
