import { expect, test } from "claude-code/testing";

import { EXPLORE_LABELS } from "./explore-first";
import { labelPrompt, parseLabels } from "./flow-prompt";
import { CHANGE_LABELS } from "./flow-policy";
import { VERIFY_LABELS } from "./task-policy";

test("the one labelling call asks only the questions it was given, with the request once", async () => {
  const p = labelPrompt("Fix the retry bug", ["change", "explore"]);
  expect(p).toContain(CHANGE_LABELS.light);
  expect(p).toContain(EXPLORE_LABELS.direct);
  expect(p).not.toContain(VERIFY_LABELS.cosmetic);
  expect(p.split("Fix the retry bug").length).toBe(2);
});

test("a reply is read per question; junk, unknown keys and unasked lines leave it unanswered", async () => {
  const asks = ["change", "verify", "explore"] as const;
  expect(
    parseLabels("change: medium\nverify: shared\nexplore: explore", asks),
  ).toEqual({
    change: CHANGE_LABELS.medium,
    verify: VERIFY_LABELS.shared,
    explore: EXPLORE_LABELS.explore,
  });
  expect(parseLabels("Change: Light", asks)).toEqual({});
  expect(parseLabels("change: huge\nverify: shared", asks)).toEqual({
    verify: VERIFY_LABELS.shared,
  });
  expect(parseLabels("verify: shared", ["change"])).toEqual({});
  expect(parseLabels("", asks)).toEqual({});
});
