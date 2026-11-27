import { expect, test } from "claude-code/testing";

import { bandWorld, measure, mountBand } from "./band-fixture";

type $ = Parameters<typeof measure>[0];
// Meters are read in the background after a measure and drawn at the next one.
const wait = () => new Promise((r) => setTimeout(r, 60));
const twice = async ($: $) => {
  await measure($);
  await wait();
  await measure($);
  await wait();
};

test("the desktop band draws a 5h and a week ring, with only the time until reset beside each", async ($, on) => {
  bandWorld(on);
  await twice($);
  const ui = await mountBand($, "desktop");
  expect(await ui.findAll({ type: "Svg" })).toHaveLength(2);
  // the ring is the share: no percentage beside it, only the time
  expect((await ui.find({ key: "kit-meters" }))?.text).toBe("4h25m4d13h");
  // the hover table names all three with their own figures
  for (const name of ["● Claude", "● GPT", "● Gemini"])
    expect(await ui.find({ type: "Text", text: name })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "wk 25%" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "5h 10%" })).toBeDefined();
  await ui.unmount();
});

test("on the right: the model and profile, then the limit, the context rightmost", async ($, on) => {
  bandWorld(on);
  await twice($);
  const ui = await mountBand($, "desktop");
  expect((await ui.find({ key: "kit-actions" }))?.text).toMatch(
    /^.*Sonnet 5\.5[○◔◑●]⏸ Off\d+k$/,
  );
  await ui.unmount();
});

test("the terminal band keeps its text meters, draws no ring and asks agy nothing", async ($, on) => {
  const w = bandWorld(on, { surface: "terminal" });
  await twice($);
  const ui = await mountBand($, "terminal");
  expect(await ui.find({ type: "Svg" })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: "·10%" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /Gemini/ })).toBeUndefined();
  expect(w.asked).toHaveLength(0);
  await ui.unmount();
});

test("agy is asked at most every 10 minutes, read-only", async ($, on) => {
  const w = bandWorld(on);
  await twice($);
  expect(w.asked).toHaveLength(1);
  expect(w.asked[0]).toContain("plan");
  w.clock.now += 11 * 60_000;
  await twice($);
  expect(w.asked).toHaveLength(2);
});

test("an agy that answers /usage with anything else is not asked again", async ($, on) => {
  const w = bandWorld(on, {
    usage: JSON.stringify({ status: "SUCCESS", response: "hi" }),
  });
  await twice($);
  w.clock.now += 11 * 60_000;
  await twice($);
  expect(w.asked).toHaveLength(1);
  const ui = await mountBand($, "desktop");
  expect(await ui.findAll({ type: "Svg" })).toHaveLength(2);
  // its line stays for the switch, without figures
  expect(await ui.find({ type: "Text", text: "wk –" })).toBeDefined();
  await ui.unmount();
});
