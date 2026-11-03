import { expect, test } from "claude-code/testing";

import { CHANGE_LABELS } from "./flow-policy";
import { LABELS } from "./model-policy";
import { VERIFY_LABELS } from "./task-policy";

import { world, write, bash, stop } from "./flow-fixture";

test("flow holds a turn that ends with unchecked changes, once per round", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  expect((await stop($)).block).toContain(
    "src/a.ts changed after the last passing check",
  );
  expect((await stop($)).block).toBe(undefined); // the same round: let through
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  await bash($, "npm test");
  w.later(1000);
  expect((await stop($)).block).toBe(undefined); // checked after the change
  const out = await $.command.run({ command: "flow", args: "" } as never);
  expect(String((out as { text?: string }).text)).toContain("holds 1");
});

test("a task growing past three files gets a note on the tool's result", async ($, on) => {
  world(on);
  for (const f of ["a", "b", "c"]) await write($, `/p/app/src/${f}.ts`);
  const fourth = (await write($, "/p/app/src/d.ts")) as { context?: string[] };
  expect(String(fourth.context)).toContain("grew from light to medium");
});

test("a turn ending on a question is never held", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/a.ts");
  w.later(1000);
  expect((await stop($, "Shall I add a test too?")).block).toBe(undefined);
});

test("with git, a change made through the shell is held until a check ran on it", async ($, on) => {
  const git = { index: "a1", work: "a1" };
  const w = world(on, {}, git);
  expect((await stop($)).block).toBe(undefined); // a clean turn sets the baseline
  git.work = "b2"; // sed -i, no Edit or Write call
  await bash($, "sed -i s/a/b/ src/a.ts");
  expect((await stop($)).block).toContain(
    "Code changed after the last passing check",
  );
  await bash($, "npm test 2>&1 | tail -5");
  expect((await stop($)).block).toBe(undefined);
  const log = w.store.flowLog as { event: string; reason?: string }[];
  expect(log[0]?.reason).toBe("changes git saw");
  expect(log.at(-1)?.event).toBe("end");
});

test("a failed edit is no change; the open task is kept per session", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/broken.ts");
  expect((await stop($)).block).toBe(undefined);
  await write($, "/p/app/src/a.ts");
  const kept = w.store.flowTasks as Record<string, { files: string[] }>;
  expect(kept.s1?.files).toEqual(["/p/app/src/a.ts"]);
});

test("/flow mark puts the user's judgment on a pick", async ($, on) => {
  const w = world(on);
  await write($, "/p/app/src/a.ts");
  const out = await $.command.run({
    command: "flow",
    args: "mark 1 too-light",
  } as never);
  expect(String((out as { text?: string }).text)).toContain(
    "Marked 1 as too-light",
  );
  const log = w.store.flowLog as { mark?: string }[];
  expect(log.at(-1)?.mark).toBe("too-light");
});

test("a commit after the passing check is no change: the turn ends", async ($, on) => {
  const git = { index: "a1", work: "a1" };
  world(on, {}, git);
  expect((await stop($)).block).toBe(undefined);
  git.work = "b2";
  await write($, "/p/app/src/a.ts");
  await bash($, "npm test");
  git.index = "b2"; // git commit -am
  await bash($, "git commit -am 'fix: b'");
  expect((await stop($)).block).toBe(undefined);
});

test("a thin reply keeps the task's levels; growth and the first failing check raise E and V", async ($, on) => {
  const w = world(on, { mode: "off" });
  const sent: (readonly string[] | undefined)[] = [];
  on("model.classify", async (_$, e) => ({
    value: e.labels.includes(CHANGE_LABELS.none)
      ? CHANGE_LABELS.light
      : e.labels.includes(VERIFY_LABELS.cosmetic)
        ? VERIFY_LABELS.behaviour
        : LABELS.routine,
  }));
  on("prompt.submit", async (_$, e) => {
    sent.push(e.context);
    return { text: e.text };
  });
  const levels = () =>
    (w.store.flowLog as { event: string; levels?: string; text: string }[])
      .filter((e) => e.levels)
      .map((e) => `${e.event} ${e.levels}`);
  const ask = (text: string) =>
    $.prompt.submit({ text, origin: { kind: "composer" } });
  await ask("Change the retry handling in src/a.ts");
  expect(String(sent[0])).toContain("kit task: D1 E0 V1."); // no GPT here: E0
  await ask("ja");
  expect(String(sent[1] ?? "")).not.toContain("kit task");
  const failed = (await bash($, "npm test fail")) as { context?: string[] };
  expect(String(failed.context)).toContain("kit task: D1 E0 V2.");
  await bash($, "npm test fail"); // the same work: no second raise
  expect(levels()).toEqual(["decision D1 E0 V1", "levels D1 E0 V2"]);
  for (const f of ["a", "b", "c"]) await write($, `/p/app/src/${f}.ts`);
  const grown = (await write($, "/p/app/src/d.ts")) as { context?: string[] };
  expect(String(grown.context)).toContain("grew from light to medium");
  expect(String(grown.context)).toContain("kit task: D1 E0 V3.");
  expect(levels().at(-1)).toBe("levels D1 E0 V3");
  const out = await $.command.run({ command: "flow", args: "" } as never);
  expect(String((out as { text?: string }).text)).toContain(
    "E1+ decisions with a GPT run: 0 of 0",
  );
});

test("an answer that grows the task raises E and V; one that raises nothing gets no note; /build still asks for verify need", async ($, on) => {
  world(on, { mode: "off" });
  const sent: (readonly string[] | undefined)[] = [];
  let change = CHANGE_LABELS.light;
  let verify = VERIFY_LABELS.behaviour;
  on("model.classify", async (_$, e) => ({
    value: e.labels.includes(CHANGE_LABELS.none)
      ? change
      : e.labels.includes(VERIFY_LABELS.cosmetic)
        ? verify
        : LABELS.routine,
  }));
  on("prompt.submit", async (_$, e) => {
    sent.push(e.context);
    return { text: e.text };
  });
  const ask = (text: string) =>
    $.prompt.submit({ text, origin: { kind: "composer" } });
  await ask("Change the retry handling in src/a.ts");
  expect(String(sent.at(-1))).toContain("kit task: D1 E0 V1.");
  await stop($, "Shall I make the timeout configurable too?");
  change = CHANGE_LABELS.medium;
  await ask("Yes, and pass it through every module that retries");
  expect(String(sent.at(-1))).toContain("grew from light to medium");
  expect(String(sent.at(-1))).toContain("kit task: D1 E0 V2.");
  await stop($, "Anything else?");
  change = CHANGE_LABELS.light;
  await ask("No, keep the default at three retries");
  expect(String(sent.at(-1) ?? "")).not.toContain("kit task");
  await stop($, "Done.");
  verify = VERIFY_LABELS.risky;
  await ask("/kit:build auth-migration");
  expect(String(sent.at(-1))).toContain("kit task: D2 E0 V3.");
});
