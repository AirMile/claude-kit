import { expect, test } from "claude-code/testing";

import {
  ahead,
  claudeTight,
  gptTight,
  newest,
  route,
  type RouteInput,
} from "./delegate-policy";

// Codex's catalog as `codex app-server` listed it (2026-10-27), hidden models already left out.
const CATALOG = [
  { id: "gpt-6.1-sol" },
  { id: "gpt-6-astra" },
  { id: "gpt-6.1-terra" },
  { id: "gpt-6-sol" },
  { id: "gpt-6-luna" },
  { id: "gpt-5.6-sol" },
  { id: "gpt-5.6-terra" },
  { id: "gpt-5.6-luna" },
  { id: "codex-auto-review" },
];
const NOW = Date.parse("2026-10-27T12:00:00Z");
const in_ = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();
const ROOM = {
  five_hour: { pct: 1, resetsAt: in_(4) },
  seven_day: { pct: 6, resetsAt: in_(100) },
};

const at = (over: Partial<RouteInput>): RouteInput => ({
  role: "build",
  gptOn: true,
  models: newest(CATALOG),
  claude: { five_hour: { pct: 20, resetsAt: in_(3) } },
  gpt: ROOM,
  now: NOW,
  ...over,
});

test("the newest version per family wins, a pin holds, a family never stands in for another", async () => {
  const m = newest(CATALOG);
  expect(m.sol?.id).toBe("gpt-6.1-sol");
  expect(m.terra?.id).toBe("gpt-6.1-terra");
  expect(m.terra?.name).toBe("Terra 6.1");
  expect(m.luna?.id).toBe("gpt-6-luna");
  expect(newest(CATALOG, { terra: "gpt-5.6-terra" }).terra?.id).toBe(
    "gpt-5.6-terra",
  );
  expect(newest(CATALOG, { terra: "gpt-9-terra" }).terra?.id).toBe(
    "gpt-6.1-terra",
  );
  expect(newest([{ id: "gpt-6.1-sol" }]).terra).toBe(undefined);
  expect(newest([...CATALOG, { id: "gpt-6.2-sol" }]).sol?.name).toBe("Sol 6.2");
});

test("a plan is tight by its 5h meter or by running ahead of its week", async () => {
  // Two days into the week (120h left of 168) is 29% gone: 40% used is 11 ahead.
  const week = { pct: 40, resetsAt: in_(120) };
  expect(Math.round(ahead(week, "seven_day", NOW))).toBe(11);
  expect(claudeTight({ seven_day: week }, NOW)).toBe(true);
  expect(claudeTight({ seven_day: { pct: 30, resetsAt: in_(120) } }, NOW)).toBe(
    false,
  );
  expect(claudeTight({ five_hour: { pct: 70 } }, NOW)).toBe(true);
  expect(gptTight({ five_hour: { pct: 80 } })).toBe(true);
  expect(gptTight({ seven_day: { pct: 89 } })).toBe(false);
});

test("with room on both, building goes to GPT and searching stays on Haiku", async () => {
  expect(route(at({ role: "build" }))).toEqual({
    provider: "gpt",
    model: "gpt-6.1-terra",
    name: "Terra 6.1",
    effort: "medium",
    sandbox: "workspace-write",
    review: false,
  });
  expect(route(at({ role: "build+" }))).toMatchObject({
    model: "gpt-6.1-sol",
    effort: "high",
  });
  expect(route(at({ role: "research" }))).toMatchObject({
    model: "gpt-6.1-sol",
    sandbox: "read-only",
  });
  expect(route(at({ role: "search" }))).toMatchObject({
    provider: "claude",
    model: "haiku",
    subagentType: "Explore",
  });
});

test("a tight Claude plan sends searching to Luna; without GPT, changes are built here", async () => {
  const tight = { five_hour: { pct: 85 } };
  expect(route(at({ role: "search", claude: tight }))).toMatchObject({
    provider: "gpt",
    model: "gpt-6-luna",
  });
  const full = { five_hour: { pct: 90 } };
  expect(route(at({ role: "build", gpt: full }))).toEqual({
    provider: "none",
    reason: "ChatGPT has no room or no model for this: build it here",
  });
  expect(route(at({ role: "build+", gpt: full })).provider).toBe("none");
  expect(route(at({ role: "research", gpt: full }))).toMatchObject({
    provider: "claude",
    model: "sonnet",
  });
  expect(route(at({ role: "plan", gpt: full }))).toMatchObject({
    reason: "ChatGPT has no room or no model for this: plan here",
  });
  expect(route(at({ role: "build", gpt: undefined }))).toMatchObject({
    reason: "Codex is not available here: build it here",
  });
});

test("a review goes to the family that did not write it", async () => {
  expect(route(at({ role: "review" }))).toMatchObject({
    provider: "gpt",
    review: true,
  });
  expect(route(at({ role: "review", author: "claude" }))).toMatchObject({
    provider: "gpt",
  });
  expect(route(at({ role: "review", author: "gpt" }))).toMatchObject({
    provider: "claude",
    model: "sonnet",
  });
});

test("a family asked for by name wins; Astra runs only that way", async () => {
  for (const role of [
    "search",
    "research",
    "build",
    "build+",
    "review",
    "plan",
  ] as const)
    expect(JSON.stringify(route(at({ role })))).not.toContain("astra");
  expect(route(at({ role: "plan", family: "astra" }))).toMatchObject({
    model: "gpt-6-astra",
  });
  expect(
    route(at({ role: "research", family: "terra", gptOn: false })),
  ).toMatchObject({ model: "gpt-6.1-terra" });
});

test("with GPT off nothing goes to GPT unless a family is named; no Claude review of Claude", async () => {
  expect(route(at({ role: "build", gptOn: false })).provider).toBe("none");
  expect(route(at({ role: "research", gptOn: false }))).toMatchObject({
    provider: "claude",
  });
  expect(route(at({ role: "review", gptOn: false }))).toMatchObject({
    provider: "none",
    reason: "GPT is off in the band; the checks and the verifier cover it",
  });
  expect(route(at({ role: "review", gptOn: false, author: "gpt" }))).toMatchObject({
    provider: "claude",
  });
});
