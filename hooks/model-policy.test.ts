import { expect, test } from "claude-code/testing";

import {
  agentKind,
  commandKind,
  displayName,
  family,
  isMode,
  kindOfLabel,
  LABELS,
  pick,
} from "./model-policy";

test("each profile maps a kind of work to a model and an effort", async () => {
  expect(pick("balanced", "question")).toEqual({
    model: "claude-haiku-5-5",
    effort: "low",
  });
  expect(pick("balanced", "heavy")).toEqual({
    model: "claude-opus-5-5",
    effort: "xhigh",
  });
  expect(pick("lean", "heavy").effort).toBe("high");
  expect(pick("quality", "planning").model).toBe("claude-fable-5-1");
});

test("kit's skills are known without the classifier", async () => {
  expect(commandKind("/build login-form")).toBe("heavy");
  expect(commandKind("/kit:product")).toBe("planning");
  expect(
    commandKind("<command-name>/kit:commit</command-name>\nstage it"),
  ).toBe("question");
  expect(commandKind("/unknown thing")).toBe(undefined);
  expect(commandKind("why does /build fail?")).toBe(undefined);
});

test("a classifier label reads back as its kind, anything else as none", async () => {
  expect(kindOfLabel(LABELS.routine)).toBe("routine");
  expect(kindOfLabel("routine")).toBe(undefined);
  expect(kindOfLabel(undefined)).toBe(undefined);
});

test("subagents of a known type get their kind", async () => {
  expect(agentKind("Explore")).toBe("question");
  expect(agentKind("kit:verifier")).toBe("routine");
  expect(agentKind("general-purpose")).toBe(undefined);
});

test("model ids and aliases name their family and a short name", async () => {
  expect(family("claude-opus-5-5[1m]")).toBe("opus");
  expect(family("sonnet")).toBe("sonnet");
  expect(family("gpt-6")).toBe(undefined);
  expect(displayName("claude-opus-5-5")).toBe("Opus 5.5");
  expect(displayName("claude-fable-5-1")).toBe("Fable 5.1");
  expect(displayName("claude-sonnet-5")).toBe("Sonnet 5");
  expect(displayName("custom")).toBe("custom");
});

test("only the three profiles and off are modes", async () => {
  expect(isMode("balanced")).toBe(true);
  expect(isMode("off")).toBe(true);
  expect(isMode("max")).toBe(false);
  expect(isMode(undefined)).toBe(false);
});
