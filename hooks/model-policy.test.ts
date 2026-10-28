import { expect, test } from "claude-code/testing";

import {
  agentKind,
  carry,
  commandKind,
  displayName,
  escalation,
  family,
  isMode,
  isThin,
  kindOfLabel,
  LABELS,
  pick,
  runLine,
  stretch,
  subagentEffort,
  switchOf,
  withSwitch,
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
  expect(pick("quality", "planning").model).toBe("claude-opus-5-5");
});

test("kit's skills are known without the classifier", async () => {
  expect(commandKind("/build login-form")).toBe("planning");
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
  expect(agentKind("kit:verifier")).toBe("planning");
  expect(agentKind("general-purpose")).toBe(undefined);
});

test("/build and the verifier run at high in every profile, never above", async () => {
  for (const profile of ["lean", "balanced"] as const) {
    expect(pick(profile, "planning").effort).toBe("high");
  }
  expect(pick("quality", "planning")).toEqual({
    model: "claude-opus-5-5",
    effort: "high",
  });
});

test("a subagent keeps the effort its Agent call asked for", async () => {
  expect(subagentEffort(undefined, "medium")).toBe("medium");
  expect(subagentEffort("high", "medium")).toBe(undefined);
});

test("a thin reply never lowers the work it continues", async () => {
  expect(isThin("ja")).toBe(true);
  expect(isThin("  ja, doe maar  ")).toBe(true);
  expect(isThin("wat doet dit?")).toBe(false);
  expect(isThin("fix the failing login test in the auth module")).toBe(false);
  expect(carry("question", "heavy", "ja")).toBe("heavy");
  expect(carry("question", "planning", "ga door")).toBe("planning");
  expect(carry("planning", "routine", "ja")).toBe("planning");
  expect(carry("question", undefined, "ja")).toBe("question");
  expect(carry("question", "heavy", "wat doet dit?")).toBe("question");
  expect(
    carry("question", "heavy", "explain how the importer handles retries"),
  ).toBe("question");
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

test("the band's run line names the model and the effort once known", async () => {
  expect(runLine("claude-opus-5-5[1m]", "medium")).toBe("Opus 5.5 · med");
  expect(runLine("claude-opus-5-5", "xhigh")).toBe("Opus 5.5 · xhi");
  expect(runLine("claude-opus-5-5", "high")).toBe("Opus 5.5 · hi");
  expect(runLine("claude-opus-5-5", "max")).toBe("Opus 5.5 · max");
  expect(runLine("claude-haiku-5-5", undefined)).toBe("Haiku 5.5");
});

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";

test("a prompt one tier above the running model gets the stretch effort, not max", async () => {
  expect(escalation(SONNET, OPUS, 80)).toEqual({
    step: "effort",
    effort: "xhigh",
  });
  expect(escalation(HAIKU, SONNET, 5)).toEqual({
    step: "effort",
    effort: "high",
  });
  expect(stretch(HAIKU)).toBe("high");
  expect(stretch(`${OPUS}[1m]`)).toBe("xhigh");
});

test("two tiers short asks; switch now only with a light context", async () => {
  expect(escalation(HAIKU, OPUS, 10)).toEqual({
    step: "ask",
    want: OPUS,
    switchNow: true,
  });
  expect(escalation(HAIKU, OPUS, 30)).toEqual({
    step: "ask",
    want: OPUS,
    switchNow: false,
  });
  expect(escalation(HAIKU, OPUS, undefined)).toEqual({
    step: "ask",
    want: OPUS,
    switchNow: false,
  });
});

test("no escalation at or above the model a prompt needs, or for an unknown model", async () => {
  expect(escalation(OPUS, OPUS, 50)).toEqual({ step: "none" });
  expect(escalation(OPUS, HAIKU, 50)).toEqual({ step: "none" });
  expect(escalation("claude-mythos-1", OPUS, 50)).toEqual({ step: "none" });
  expect(escalation(`${OPUS}[1m]`, "claude-fable-5-1", 50)).toEqual({ step: "none" });
});

test("a switch is stored per session, junk ignored, the newest twenty kept", async () => {
  const one = withSwitch({ junk: 1, old: { chosen: 3 } }, "s1", {
    chosen: OPUS,
    base: HAIKU,
  });
  expect(one).toEqual({ s1: { chosen: OPUS, base: HAIKU } });
  expect(switchOf(one, "s1")).toEqual({ chosen: OPUS, base: HAIKU });
  expect(switchOf(one, "s2")).toBe(undefined);
  expect(withSwitch(one, "s1", undefined)).toEqual({});
  let many: unknown = {};
  for (let i = 0; i < 25; i++)
    many = withSwitch(many, `s${i}`, { chosen: OPUS, base: HAIKU });
  expect(Object.keys(many as object).length).toBe(20);
  expect(switchOf(many, "s24")).toEqual({ chosen: OPUS, base: HAIKU });
  expect(switchOf(many, "s0")).toBe(undefined);
});
