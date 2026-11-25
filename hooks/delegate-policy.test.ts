import { expect, test } from "claude-code/testing";

import { newest, route, type RouteInput } from "./delegate-policy";
import { gptRefusal, runCost } from "./gpt-limits";

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

test("a run needs room in both ChatGPT windows; a reset window counts as empty", async () => {
  const five = (pct: number, hours = 3) => ({
    five_hour: { pct, resetsAt: in_(hours) },
  });
  expect(gptRefusal(five(90), NOW, 5)).toBe(undefined);
  expect(gptRefusal(five(91), NOW, 5)).toBe(
    "ChatGPT's 5h window is at 91% (resets in 3h 0m)",
  );
  expect(gptRefusal(five(99, -1), NOW, 5)).toBe(undefined);
  expect(gptRefusal({ seven_day: { pct: 94 } }, NOW, 5)).toBe(undefined);
  expect(
    gptRefusal({ seven_day: { pct: 95, resetsAt: in_(50) } }, NOW, 5),
  ).toBe("ChatGPT's week is at 95% (resets in 2d 2h)");
});

test("a large build and Astra need more room than a Sol review", async () => {
  expect(runCost("review", "sol")).toBe(5);
  expect(runCost("build+", "sol")).toBe(20);
  expect(runCost("plan", "astra")).toBe(18);
  expect(runCost("build", "astra")).toBe(25);
});

test("Claude searches, researches and builds; GPT gives the review and the second plan", async () => {
  expect(route(at({ role: "search" }))).toMatchObject({
    provider: "claude",
    model: "sonnet",
    subagentType: "Explore",
  });
  expect(route(at({ role: "research" }))).toMatchObject({
    provider: "claude",
    model: "sonnet",
  });
  for (const role of ["build", "build+"] as const)
    expect(route(at({ role }))).toEqual({
      provider: "none",
      reason:
        "Claude does this itself; GPT is for a review, a second plan or a model you name: do it here",
    });
  expect(route(at({ role: "review" }))).toEqual({
    provider: "gpt",
    model: "gpt-6.1-sol",
    name: "Sol 6.1",
    effort: "high",
    sandbox: "read-only",
    review: true,
  });
  expect(route(at({ role: "plan" }))).toMatchObject({
    model: "gpt-6.1-sol",
    sandbox: "read-only",
  });
});

test("a named model runs any role", async () => {
  expect(route(at({ role: "build", family: "terra" }))).toEqual({
    provider: "gpt",
    model: "gpt-6.1-terra",
    name: "Terra 6.1",
    effort: "medium",
    sandbox: "workspace-write",
    review: false,
  });
  expect(route(at({ role: "build+", family: "sol" }))).toMatchObject({
    model: "gpt-6.1-sol",
    effort: "high",
  });
  expect(route(at({ role: "search", family: "luna" }))).toMatchObject({
    model: "gpt-6-luna",
    effort: "low",
    sandbox: "read-only",
  });
});

test("a named model runs past the limit unless the caller is strict", async () => {
  const gpt = { five_hour: { pct: 90, resetsAt: in_(3) } };
  const large = { role: "build+", family: "sol", gpt } as const;
  expect(route(at(large)).provider).toBe("gpt");
  expect(route(at({ ...large, strict: true }))).toEqual({
    provider: "none",
    reason: "ChatGPT's 5h window is at 90% (resets in 3h 0m): do it here",
  });
  expect(
    route(at({ role: "build", family: "terra", gpt, strict: true })).provider,
  ).toBe("gpt");
  // A failed meter read leaves no room to count on.
  for (const unread of [undefined, {}])
    expect(route(at({ ...large, gpt: unread, strict: true }))).toEqual({
      provider: "none",
      reason: "ChatGPT's limits could not be read: do it here",
    });
});

test("a full window leaves the review open and plans here", async () => {
  const gpt = { five_hour: { pct: 93, resetsAt: in_(2) } };
  const full = "ChatGPT's 5h window is at 93% (resets in 2h 0m)";
  expect(route(at({ role: "review", gpt }))).toEqual({
    provider: "none",
    reason: `${full}; the task stays open until it has a review or the user waives it`,
  });
  expect(route(at({ role: "plan", gpt }))).toEqual({
    provider: "none",
    reason: `${full}: plan here`,
  });
  expect(route(at({ role: "plan", gpt: undefined }))).toMatchObject({
    reason: "Codex is not available here: plan here",
  });
  expect(
    route(at({ role: "plan", models: newest([{ id: "gpt-6-luna" }]) })),
  ).toMatchObject({ reason: "no sol model in Codex's catalog: plan here" });
});

test("a follow-up stays on its GPT thread within the limits and never becomes a build", async () => {
  const follow = { role: "research", continues: "sol" } as const;
  expect(route(at(follow))).toMatchObject({
    model: "gpt-6.1-sol",
    sandbox: "read-only",
  });
  expect(route(at({ role: "build", continues: "sol" })).provider).toBe("none");
  expect(
    route(at({ ...follow, gpt: { five_hour: { pct: 93 } } })).provider,
  ).toBe("claude");
  expect(route(at({ ...follow, gptOn: false })).provider).toBe("claude");
});

test("the riskiest review takes Astra when it fits, otherwise Sol", async () => {
  const deep = { role: "review", prefer: "astra" } as const;
  expect(route(at(deep))).toMatchObject({
    model: "gpt-6-astra",
    sandbox: "read-only",
  });
  expect(
    route(at({ ...deep, gpt: { five_hour: { pct: 80 } } })),
  ).toMatchObject({ model: "gpt-6.1-sol" });
  expect(
    route(at({ ...deep, models: newest([{ id: "gpt-6.1-sol" }]) })),
  ).toMatchObject({ model: "gpt-6.1-sol" });
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

test("without a name or the riskiest review, nothing runs on Astra", async () => {
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
    reason:
      "GPT is off in the band; the task stays open until it has a review or the user waives it",
  });
  expect(
    route(at({ role: "review", gptOn: false, author: "gpt" })),
  ).toMatchObject({
    provider: "claude",
  });
});

const pro = (over: Partial<RouteInput>) => at({ plan: "pro", ...over });

test("on Claude Pro GPT also searches, researches and builds while its share has room", async () => {
  for (const [role, model] of [
    ["search", "gpt-6-luna"],
    ["research", "gpt-6.1-sol"],
    ["build", "gpt-6.1-terra"],
    ["build+", "gpt-6.1-sol"],
  ] as const)
    expect(route(pro({ role }))).toMatchObject({ provider: "gpt", model });
  expect(route(pro({ role: "build", continues: "sol" }))).toMatchObject({
    model: "gpt-6.1-sol",
  });
  // A follow-up stays inside the share too: it may not eat the reviews' part.
  const gpt = { five_hour: { pct: 80 } };
  expect(
    route(pro({ role: "research", continues: "sol", gpt })).provider,
  ).toBe("claude");
});

test("on Pro the last part of each window is kept for reviews", async () => {
  const five = { five_hour: { pct: 66, resetsAt: in_(3) } };
  expect(route(pro({ role: "build", gpt: five }))).toEqual({
    provider: "none",
    reason:
      "ChatGPT's 5h window is at 66%, the rest is kept for reviews: do it here",
  });
  expect(route(pro({ role: "build", gpt: { five_hour: { pct: 65 } } })).provider).toBe("gpt");
  expect(route(pro({ role: "review", gpt: five })).provider).toBe("gpt");
  const week = { seven_day: { pct: 76, resetsAt: in_(10) } };
  expect(route(pro({ role: "research", gpt: week }))).toMatchObject({
    provider: "claude",
    why: "ChatGPT's week is at 76%, the rest is kept for reviews: do it here",
  });
});

test("on Pro the plan further behind on its week takes the work", async () => {
  // 100h left of 168 is 40% gone: 60% used is 20 ahead.
  const used = (pct: number) => ({
    seven_day: { pct, resetsAt: in_(100) },
  });
  const gpt = used(60);
  expect(
    route(pro({ role: "research", gpt, claude: used(45) })),
  ).toMatchObject({
    provider: "claude",
    why: "ChatGPT's week is further used than Claude's: do it here",
  });
  expect(
    route(pro({ role: "research", gpt, claude: used(55) })).provider,
  ).toBe("gpt");
});

test("on Pro without GPT the work stays on Claude", async () => {
  expect(route(pro({ role: "build", gptOn: false }))).toMatchObject({
    reason: "GPT is off in the band: do it here",
  });
  expect(route(pro({ role: "search", gpt: undefined })).provider).toBe("claude");
  expect(route(pro({ role: "build", gpt: {} })).provider).toBe("none");
});

test("no run kit picks starts without any ChatGPT meter", async () => {
  expect(route(at({ role: "review", gpt: {} }))).toMatchObject({
    provider: "none",
    reason:
      "ChatGPT's limits could not be read; the task stays open until it has a review or the user waives it",
  });
  expect(route(at({ role: "plan", gpt: {} })).provider).toBe("none");
});
