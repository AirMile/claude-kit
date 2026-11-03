import { expect, test } from "claude-code/testing";
import { CHANGE_LABELS } from "./flow-policy";
import { LABELS } from "./model-policy";
import { world, band, runText } from "./auto-model-fixture";

const TYPED = { kind: "composer" } as const;
const QUESTION = LABELS.question;
const HEAVY = LABELS.heavy;
const ROUTINE = LABELS.routine;

test("flow sends a track note with a change task; a question gets none", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: QUESTION,
    labels: [HEAVY],
    change: CHANGE_LABELS.heavy,
    turns: 5,
  });
  await $.prompt.submit({ text: "rebuild the importer", origin: TYPED });
  expect(String(w.sent[0]?.context)).toContain("kit flow (heavy)");
  // The decision note rides along; without GPT room Execute drops to E0, Verify stays.
  expect(String(w.sent[0]?.context)).toContain("kit task: D2 E0 V2.");
  expect(String(w.sent[0]?.context)).toContain("GPT has no room: E0");
  await $.prompt.submit({ text: "what does this do?", origin: TYPED });
  expect(w.sent[1]?.context ?? []).toEqual([]);
});

test("flow works with the profile off and stays off the band", async ($, on) => {
  const w = world(on, {
    model: "claude-opus-5-5",
    label: ROUTINE,
    change: CHANGE_LABELS.light,
    turns: 5,
    drawn: true,
    store: { mode: "off" },
  });
  const ui = await band($, on);
  await $.prompt.submit({ text: "add a submit button", origin: TYPED });
  expect(String(w.sent[0]?.context)).toContain("kit flow (light)");
  expect(await ui.find({ type: "Text", text: /flow light/ })).toBeFalsy();
});

test("a /build kit started on the user's click gets the profile's model and effort", async ($, on) => {
  world(on, { model: "claude-opus-5-5", label: HEAVY, turns: 5, drawn: true });
  const ui = await band($, on);
  await $.prompt.submit({
    text: "/kit:build login-form",
    origin: { kind: "plugin", name: "kit" } as never,
  });
  expect(await runText(ui)).toContain("▆ Opus 5.5");
});
