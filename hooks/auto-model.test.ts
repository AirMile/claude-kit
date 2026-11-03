import { expect, test } from "claude-code/testing";


import { world, band, runText, effortLevel } from "./auto-model-fixture";
import { newTask, type Task } from "./flow-policy";
import { FOOTER } from "./delegate-run";

const TYPED = { kind: "composer" } as const;
const QUESTION =
  "question: explain, look something up, a short question or a one-line change";
const ROUTINE =
  "routine: write or change ordinary code, fix a clear bug, styling";
const HEAVY =
  "heavy: large refactor, a stuck or hard bug, a long multi-step build";
const settle = () => new Promise((r) => setTimeout(r, 20));

test("the first prompt asks to switch when the picked model differs", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: QUESTION,
    answer: "Switch to Haiku 5.5",
  });
  await $.prompt.submit({ text: "what does this function do?", origin: TYPED });
  await $.prompt.submit({ text: "and this one?", origin: TYPED });
  expect(w.asked.length).toBe(1); // only the first prompt picks a model
});

test("no question when the session already runs the picked model", async ($, on) => {
  const w = world(on, { model: "claude-sonnet-5-5", label: ROUTINE });
  await $.prompt.submit({ text: "add a submit button", origin: TYPED });
  expect(w.asked).toEqual([]);
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

test("two tiers short asks; a subagent keeps the model and rides along as a note", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 10,
    answer: "Ask a Opus 5.5 subagent",
  });
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  await $.prompt.submit({ text: "and the billing layer", origin: TYPED });
  expect(w.asked.length).toBe(1); // the choice holds for the chat
  expect(w.offered[0]).toContain("Switch to Opus 5.5 now");
  expect(w.store.switches).toBeUndefined();
  expect(w.sent.map((s) => s.text)).toEqual([
    "refactor the auth layer",
    "and the billing layer",
  ]);
  for (const s of w.sent) expect(String(s.context)).toContain('model "opus"');
});

test("a full context offers no switch now; staying is not asked again", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 60,
    answer: "Stay on Haiku 5.5 at high effort",
  });
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  await $.prompt.submit({ text: "and the billing layer", origin: TYPED });
  expect(w.asked.length).toBe(1);
  expect(w.offered[0]).not.toContain("now");
  expect(w.sent.length).toBe(2);
});

test("clear, then switch: the prompt is held, the chat cleared, and sent again", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 60,
    answer: "Clear, then Opus 5.5",
  });
  const r = await $.prompt.submit({
    text: "refactor the auth layer",
    origin: TYPED,
  });
  expect(String((r as { drop?: string }).drop)).toContain("clearing");
  await settle();
  expect(w.cleared).toEqual(["clear"]);
  expect(w.sent.map((s) => s.text)).toEqual(["refactor the auth layer"]);
  expect(w.store.switches).toEqual({
    s1: { chosen: "claude-opus-5-5", base: "claude-haiku-5-5" },
  });
});

test("one tier short runs without a question", async ($, on) => {
  const w = world(on, { model: "claude-haiku-5-5", label: ROUTINE, turns: 5 });
  await $.prompt.submit({ text: "add a submit button", origin: TYPED });
  expect(w.asked).toEqual([]);
});

test("a stored switch survives a reload: no question on the stronger model", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: HEAVY,
    turns: 5,
    percent: 60,
    store: {
      switches: { s1: { chosen: "claude-opus-5-5", base: "claude-haiku-5-5" } },
    },
  });
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  expect(w.asked).toEqual([]);
});

test("with the profile off ‹ and › step the effort; with a profile on they hide", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: QUESTION,
    drawn: true,
    store: { mode: "off" },
  });
  const ui = await band($, on);
  expect(await runText(ui)).toBe("Haiku 5.5");
  expect((await ui.find({ key: "kit-profile" }))?.text).toBe("○");
  await ui.press({ key: "kit-effort-up" }); // default → low
  await ui.press({ key: "kit-effort-up" }); // → medium
  expect(w.store.effortLock).toBe("medium");
  expect((await effortLevel(ui))?.trim()).toBe("▄");
  await ui.press({ key: "kit-effort-down" });
  await ui.press({ key: "kit-effort-down" }); // → default
  await ui.press({ key: "kit-effort-down" }); // stays
  expect(w.store.effortLock).toBe(undefined);
  await ui.press({ key: "kit-profile" }); // Off → Lean
  await ui.press({ key: "kit-profile" }); // → Balanced
  expect(w.store.mode).toBe("balanced");
  expect((await ui.find({ key: "kit-profile" }))?.text).toBe("◑");
  expect(await ui.find({ key: "kit-effort-up" })).toBeFalsy();
  expect(await runText(ui)).toContain("Haiku 5.5");
});

test("a thin reply keeps the effort of the work it continues", async ($, on) => {
  world(on, {
    model: "claude-opus-5-5",
    label: HEAVY,
    labels: [HEAVY, QUESTION, QUESTION],
    turns: 5,
    drawn: true,
  });
  const ui = await band($, on);
  const shown = async () => (await runText(ui))?.split(" ").at(0);
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  expect(await shown()).toBe("▇");
  await $.prompt.submit({ text: "ja", origin: TYPED });
  expect(await shown()).toBe("▇");
  await $.prompt.submit({
    text: "what does the importer do on retries",
    origin: TYPED,
  });
  expect(await shown()).toBe("▂");
});

test("/build runs at high, a plain heavy prompt at xhigh", async ($, on) => {
  world(on, { model: "claude-opus-5-5", label: HEAVY, turns: 5, drawn: true });
  const ui = await band($, on);
  await $.prompt.submit({ text: "/build login-form", origin: TYPED });
  expect(await runText(ui)).toBe("▆ Opus 5.5");
  await $.prompt.submit({ text: "refactor the auth layer", origin: TYPED });
  expect(await runText(ui)).toBe("▇ Opus 5.5");
});

test("clear behind the band's context figure clears just after the press", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: QUESTION,
    drawn: true,
  });
  const ui = await band($, on);
  await ui.press({ key: "kit-ctx" });
  await ui.press({ key: "kit-clear" });
  await settle();
  expect(w.cleared).toEqual(["clear"]);
});

test("Commit, first in the band's Git menu, starts /kit:commit", async ($, on) => {
  world(on, { model: "claude-haiku-5-5", label: QUESTION, drawn: true });
  const ran: string[] = [];
  on("command.run", { command: "kit:commit" }, async () => {
    ran.push("kit:commit");
    return { text: "" };
  });
  const ui = await band($, on);
  await ui.press({ key: "kit-git" });
  await ui.press({ key: "kit-git-Commit" });
  expect(ran).toEqual(["kit:commit"]);
});

test("the band's Git menu sends its item as a prompt", async ($, on) => {
  const w = world(on, {
    model: "claude-haiku-5-5",
    label: QUESTION,
    drawn: true,
  });
  const ui = await band($, on);
  await ui.press({ key: "kit-git" });
  await ui.press({ key: "kit-git-Push" });
  expect(w.sent.map((m) => m.text)).toEqual([
    "Push the current branch to origin.",
  ]);
});

test("the band's GPT switch turns GPT off with a press", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: ROUTINE,
    turns: 5,
    drawn: true,
  });
  const ui = await band($, on);
  await $.prompt.submit({ text: "add a submit button", origin: TYPED });
  expect((await ui.find({ key: "kit-gpt" }))?.text).toBe("GPT");
  await ui.press({ key: "kit-gpt" });
  expect(w.store.gpt).toBe(false);
  expect((await ui.find({ key: "kit-gpt" }))?.text).toBe("GPT off");
  expect(await ui.find({ key: "kit-opinion" })).toBeFalsy();
});

for (const route of ["off", "fork", "custom", "picked"]) {
  test(`agent.spawn forwards the review prompt on the ${route} path`, async ($, on) => {
    const w = world(on, {
      model: "claude-sonnet-5-5",
      label: ROUTINE,
      store: {
        mode: route === "off" ? "off" : "balanced",
        flowTasks: {
          s1: {
            ...newTask(1, "light"),
            lastEditAt: 1,
            gptWrote: true,
            gateV: 2,
          },
        },
      },
    });
    on("agent.spawn", async () => ({ model: "sonnet", agentId: "reviewer" }));
    on("turn.complete", async () => ({ text: "" }));
    await $.agent.spawn({
      subagentType: route === "custom" ? "custom" : "general-purpose",
      prompt: FOOTER.review,
      fork: route === "fork",
      provider: { plugin: route === "custom" ? "user" : "engine" },
    } as never);
    await $.turn.complete({
      agentId: "reviewer",
      answer: "verdict: pass",
      reason: "answer",
    } as never);
    expect((w.store.flowTasks as { s1: Task }).s1.review).toMatchObject({
      outcome: "pass",
      family: "claude",
    });
  });
}
