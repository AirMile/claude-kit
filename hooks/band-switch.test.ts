import { expect, test } from "claude-code/testing";

import { bandWorld, measure, mountBand } from "./band-fixture";

// The GPT and Gemini switches in the rings' table.
type $ = Parameters<typeof measure>[0];
const wait = () => new Promise((r) => setTimeout(r, 60));
const twice = async ($: $) => {
  await measure($);
  await wait();
  await measure($);
  await wait();
};
type Found = { find: (q: object) => Promise<{ text?: string } | undefined> };
const state = async (ui: Found, plan: "gpt" | "gemini") =>
  (await ui.find({ key: `kit-switch-${plan}` }))?.text;
const shows = async (ui: Found, text: string) =>
  Boolean(await ui.find({ type: "Text", text }));

test("no GPT button: the rings' table holds a switch for GPT and for Gemini", async ($, on) => {
  bandWorld(on);
  await twice($);
  const ui = await mountBand($, "desktop");
  expect(await ui.find({ key: "kit-gpt" })).toBeFalsy();
  expect(await state(ui, "gpt")).toBe("on");
  expect(await state(ui, "gemini")).toBe("on");
  expect(await ui.find({ key: "kit-switch-claude" })).toBeFalsy();
  await ui.unmount();
});

test("a press turns Gemini off: its figures go and agy is not asked again", async ($, on) => {
  const w = bandWorld(on);
  await twice($);
  const ui = await mountBand($, "desktop");
  expect(await shows(ui, "wk 25%")).toBe(true);
  await ui.press({ key: "kit-switch-gemini" });
  await wait();
  expect(w.store.gemini).toBe(false);
  expect(await state(ui, "gemini")).toBe("off");
  expect(await shows(ui, "wk 25%")).toBe(false);
  w.clock.now += 11 * 60_000;
  await twice($);
  expect(w.asked).toHaveLength(1);
  await ui.unmount();
});

test("GPT off and on again shows ChatGPT's figures at once", async ($, on) => {
  const w = bandWorld(on);
  await twice($);
  const ui = await mountBand($, "desktop");
  expect(await shows(ui, "5h 10%")).toBe(true);
  await ui.press({ key: "kit-switch-gpt" });
  await wait();
  expect(w.store.gpt).toBe(false);
  expect(await shows(ui, "5h 10%")).toBe(false);
  await measure($); // a turn while it is off
  await ui.press({ key: "kit-switch-gpt" });
  await wait();
  expect(await state(ui, "gpt")).toBe("on");
  expect(await shows(ui, "5h 10%")).toBe(true);
  await ui.unmount();
});

test("both off from the start: the table still offers them and nothing is read", async ($, on) => {
  const w = bandWorld(on, { store: { gpt: false, gemini: false } });
  await twice($);
  const ui = await mountBand($, "desktop");
  expect(await state(ui, "gpt")).toBe("off");
  expect(await state(ui, "gemini")).toBe("off");
  expect(w.asked).toHaveLength(0);
  await ui.press({ key: "kit-switch-gemini" });
  await wait();
  expect(w.asked).toHaveLength(1);
  expect(await shows(ui, "wk 25%")).toBe(true);
  await ui.unmount();
});

test("a switch flipped in another chat shows at the next draw", async ($, on) => {
  const w = bandWorld(on);
  await twice($);
  w.store.gpt = false;
  const ui = await mountBand($, "desktop");
  expect(await state(ui, "gpt")).toBe("off");
  await ui.unmount();
});

test("before any plan reported, the desktop band still offers both switches", async ($, on) => {
  bandWorld(on);
  const ui = await mountBand($, "desktop");
  expect(await state(ui, "gpt")).toBe("on");
  expect(await state(ui, "gemini")).toBe("on");
  expect(await ui.findAll({ type: "Svg" })).toHaveLength(2);
  await ui.unmount();
});

test("a switch that cannot be saved stays off and reads nothing", async ($, on) => {
  const w = bandWorld(on, {
    store: { gemini: false },
    brokenWrite: "gemini",
  });
  await twice($);
  const ui = await mountBand($, "desktop");
  await ui.press({ key: "kit-switch-gemini" });
  await wait();
  expect(await state(ui, "gemini")).toBe("off");
  expect(w.asked).toHaveLength(0);
  await ui.unmount();
});
