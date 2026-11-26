import { expect, test } from "claude-code/testing";

import { parseAgyUsage } from "./agy-usage";
import { AGY_USAGE } from "./band-fixture";

test("agy's /usage gives Gemini's two windows as shares used", () => {
  expect(parseAgyUsage(AGY_USAGE)).toEqual({
    five_hour: { pct: 5, resetsAt: "2026-10-27T15:00:00Z" },
    seven_day: { pct: 25, resetsAt: "2026-11-01T12:00:00Z" },
  });
});

test("anything but the usage command's own answer is no reading", () => {
  // an agy without /usage in print mode sends it to a model and returns a response
  expect(parseAgyUsage(JSON.stringify({ status: "SUCCESS", response: "Usage?" }))).toBeUndefined();
  expect(parseAgyUsage("not json")).toBeUndefined();
  expect(parseAgyUsage("")).toBeUndefined();
  const empty = { command: { name: "usage", data: { groups: [] } } };
  expect(parseAgyUsage(JSON.stringify(empty))).toBeUndefined();
});
