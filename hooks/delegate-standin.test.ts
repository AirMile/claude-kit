import { expect, test } from "claude-code/testing";

import { delegate, world } from "./delegate-fixture";
import { newTask } from "./flow-policy";

// The Gemini switch: a review or second plan GPT cannot take goes to Gemini.
const AGY = {
  json: JSON.stringify({
    conversation_id: "c-1",
    status: "SUCCESS",
    response: "Conclusion: fine.",
  }),
};
const FULL = {
  argv: ["/bin/codex"],
  models: [{ id: "gpt-6.1-sol" }],
  limits: {
    five_hour: { pct: 99, resetsAt: "2026-10-27T16:00:00Z" },
    seven_day: { pct: 6, resetsAt: "2026-10-31T16:00:00Z" },
  },
};
type World = ReturnType<typeof world>;
const ran = (w: World, bin: string) =>
  w.spawned.filter((s) => s.argv[0] === bin).length;
const REVIEW = { role: "review", brief: "Review the changes." };

test("GPT off: a review goes to Gemini, read-only, and the answer says why", async ($, on) => {
  const w = world(on, { store: { gpt: false }, agy: AGY });
  const out = await delegate($, { ...REVIEW, author: "claude" });
  expect(out).toContain("GPT is off in the band: Gemini stands in");
  expect(out).toContain(
    "Gemini 4 Hydrogen (review, plan, read-only, effort high)",
  );
  expect(ran(w, "/bin/agy")).toBe(1);
  expect(ran(w, "/bin/codex")).toBe(0);
});

test("ChatGPT full: a second plan goes to Gemini", async ($, on) => {
  const w = world(on, { status: FULL, agy: AGY });
  const out = await delegate($, { role: "plan", brief: "Plan it." });
  expect(out).toContain("Gemini stands in");
  expect(out).toContain("Gemini 4 Hydrogen (plan,");
  expect(ran(w, "/bin/codex")).toBe(0);
});

test("the Gemini switch off keeps the Claude reviewer, and a plan stays here", async ($, on) => {
  const w = world(on, { store: { gpt: false, gemini: false }, agy: AGY });
  expect(await delegate($, REVIEW)).toContain("GPT is off in the band");
  expect(await delegate($, { role: "plan", brief: "Plan it." })).toContain(
    "Not delegated: GPT is off in the band: plan here",
  );
  expect(ran(w, "/bin/agy")).toBe(0);
});

test("an asked-for GPT, a named model and a change Gemini wrote never move to Gemini", async ($, on) => {
  const w = world(on, { status: FULL, agy: AGY });
  await delegate($, { ...REVIEW, provider: "gpt" });
  await delegate($, { ...REVIEW, author: "gemini" });
  await delegate($, { role: "research", brief: "Weigh it.", family: "luna" });
  expect(ran(w, "/bin/agy")).toBe(0);
});

test("without agy the Claude reviewer stands in as before", async ($, on) => {
  const w = world(on, { store: { gpt: false }, noAgy: true });
  const out = await delegate($, REVIEW);
  expect(out).toContain("a fresh Claude reviewer stands in");
  expect(out).not.toContain("Gemini stands in");
  expect(ran(w, "/bin/agy")).toBe(0);
});

test("/gemini turns the switch off and on and says what it does", async ($, on) => {
  const w = world(on);
  const run = async (args: string) =>
    String(
      (
        (await $.command.run({ command: "gemini", args } as never)) as {
          text?: string;
        }
      ).text,
    );
  expect(await run("off")).toContain("Gemini off");
  expect(w.store.gemini).toBe(false);
  expect(await run("")).toContain("Gemini: off");
  expect(await run("on")).toContain("Gemini on");
  expect(w.store.gemini).toBe(true);
  expect(await run("")).toContain("gemini-4-hydrogen-high");
});

test("code Gemini wrote in this task is not sent back to it, author given or not", async ($, on) => {
  on("session.id", async () => ({ value: "s1" }));
  const task = newTask(Date.parse("2026-10-27T12:00:00Z"), "heavy");
  const w = world(on, {
    agy: AGY,
    store: {
      gpt: false,
      flowTasks: { s1: { ...task, geminiWrote: true } },
    },
  });
  const out = await delegate($, REVIEW);
  expect(out).toContain("a fresh Claude reviewer stands in");
  expect(ran(w, "/bin/agy")).toBe(0);
});

test("a stand-in that gives no answer leaves the Claude reviewer, and says why", async ($, on) => {
  on("clock.after", () => new Promise<never>(() => {}));
  const json = JSON.stringify({ status: "ERROR", error: "quota exceeded" });
  const w = world(on, { store: { gpt: false }, agy: { json, code: 1 } });
  const out = await delegate($, REVIEW);
  expect(out).toContain("Gemini could not stand in");
  expect(out).toContain("a fresh Claude reviewer stands in");
  expect(ran(w, "/bin/agy")).toBeGreaterThan(0);
});

test("a switch that cannot be read counts as Gemini off", async ($, on) => {
  const w = world(on, { store: { gpt: false }, brokenKey: "gemini", agy: AGY });
  await delegate($, REVIEW);
  expect(ran(w, "/bin/agy")).toBe(0);
});

for (const offDuring of ["diff", "status"] as const)
  test(`Gemini switched off during git ${offDuring}: nothing is sent`, async ($, on) => {
    const w = world(on, { store: { gpt: false }, offDuring, agy: AGY });
    const out = await delegate($, REVIEW);
    expect(out).toContain("a fresh Claude reviewer stands in");
    expect(out).toContain("switched off");
    expect(ran(w, "/bin/agy")).toBe(0);
  });

test("/gemini off says so when it could not be saved", async ($, on) => {
  world(on, { brokenWrite: "gemini" });
  const out = (await $.command.run({
    command: "gemini",
    args: "off",
  } as never)) as { text?: string };
  expect(String(out.text)).toContain("could not save");
});

test("a retry refused after the first attempt says the brief was already sent", async ($, on) => {
  const denied = JSON.stringify({
    conversation_id: "c-2",
    status: "SUCCESS",
    response: "",
    denied_actions: [{ action: "command" }],
  });
  on("clock.after", () => new Promise<never>(() => {}));
  const w = world(on, {
    store: { gpt: false },
    agy: { json: denied },
    offDuring: "agy",
  });
  const out = await delegate($, REVIEW);
  expect(out).toContain("had already sent the brief");
  expect(ran(w, "/bin/agy")).toBe(1);
});
