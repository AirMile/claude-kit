import { expect, test } from "claude-code/testing";

import { bash, world, write } from "./flow-fixture";

type Call = { deny?: string };
const run = ($: unknown, args: string) =>
  ($ as { command: { run: (i: never) => Promise<{ text?: string }> } }).command.run({
    command: "commitgate",
    args,
  } as never);
const commit = ($: unknown) => bash($ as never, "git commit -m x") as Promise<Call>;

async function medium($: unknown, w: ReturnType<typeof world>) {
  for (const f of ["a", "b", "c", "d"]) await write($ as never, `/p/app/src/${f}.ts`);
  w.later(1000);
}

test("a commit is denied while a medium task is unchecked, allowed once it passed a check", async ($, on) => {
  const w = world(on);
  await medium($, w);
  expect((await commit($)).deny).toContain("kit commit gate");
  await bash($ as never, "npm test");
  w.later(1000);
  expect((await commit($)).deny).toBeUndefined();
});

test("a light task and a non-commit command are never held", async ($, on) => {
  const w = world(on);
  await write($ as never, "/p/app/src/a.ts");
  w.later(1000);
  expect((await commit($)).deny).toBeUndefined();
  await medium($, w);
  expect((await bash($ as never, "git status") as Call).deny).toBeUndefined();
});

test("/commitgate off lets the commit through, on holds it again", async ($, on) => {
  const w = world(on);
  await medium($, w);
  expect(String((await run($, "off")).text)).toContain("off");
  expect((await commit($)).deny).toBeUndefined();
  expect(String((await run($, "on")).text)).toContain("on");
  expect((await commit($)).deny).toContain("kit commit gate");
  expect(String((await run($, "status")).text)).toContain("on");
});
