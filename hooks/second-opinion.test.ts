import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

import { opinionPrompt } from "./second-opinion";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
function world(on: On) {
  const sent: { text: string; asUser?: boolean }[] = [];
  let now = Date.parse("2026-10-17T12:00:00Z");
  on("clock.now", async () => ({ value: now }));
  on("clock.after", async () => ({ value: undefined })); // fires at once
  on("store.get", async () => ({ value: "off" })); // auto-model stays out of the way
  on("session.model", async () => ({ value: "claude-opus-5-5" }));
  on("session.id", async () => ({ value: "s1" }));
  on("ui.panes", async () => ({ value: [] }));
  on("ui.toast", async () => ({ value: undefined }));
  on("prompt.submit", async (_$, e) => {
    const origin = e.origin as { asUser?: true };
    sent.push({ text: e.text, asUser: origin.asUser });
    return { text: e.text };
  });
  return { sent, later: (ms: number) => (now += ms) };
}

test("a GPT pick goes through Codex, a Claude pick to a subagent on that model", async () => {
  const gpt = opinionPrompt("Sol 6.1", "Opinion");
  expect(gpt).toContain("GPT Sol 6.1 through Codex");
  expect(gpt).toContain("read-only");
  const claude = opinionPrompt("claude-opus-5-5", "Opinion");
  expect(claude).toContain(
    'Opus 5.5 in a fresh subagent (Agent tool, model "opus"',
  );
  expect(claude).not.toContain("Codex");
});

test("Review asks for the changes, Stuck for a diagnosis, Opinion for the work at hand", async () => {
  expect(opinionPrompt("Sol 6.1", "Review")).toContain("review the current changes");
  expect(opinionPrompt("Sol 6.1", "Stuck")).toContain("diagnose it");
  expect(opinionPrompt("Sol 6.1", "Opinion")).toContain("second opinion");
});

function band($: Parameters<Parameters<typeof test>[1]>[0]) {
  return $.ui.mount({
    plugin: "kit",
    surface: "terminal",
    component: "AbovePrompt",
    props: { hasSurvey: false, isWorking: false } as never,
  });
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test("the band's ⚖ sends a row's pick as the person's own prompt, a double click once", async ($, on) => {
  const w = world(on);
  const ui = await band($);
  await ui.press({ key: "kit-opinion" });
  await ui.press({ key: "kit-opinion-Review-Astra 6" });
  await settle();
  expect(w.sent.length).toBe(1);
  expect(w.sent[0]?.asUser).toBe(true);
  expect(w.sent[0]?.text).toContain("Have GPT Astra 6 through Codex");
  await ui.press({ key: "kit-opinion" });
  await ui.press({ key: "kit-opinion-Stuck-claude-sonnet-5-5" });
  await settle();
  expect(w.sent.length).toBe(1); // within 2s of the first press
  w.later(3000);
  await ui.press({ key: "kit-opinion" });
  await ui.press({ key: "kit-opinion-Stuck-claude-sonnet-5-5" });
  await settle();
  expect(w.sent.length).toBe(2);
  expect(w.sent[1]?.text).toContain('Sonnet 5.5 in a fresh subagent (Agent tool, model "sonnet"');
  expect(w.sent[1]?.text).toContain("We are stuck");
});
