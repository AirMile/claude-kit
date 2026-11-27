import { expect, test } from "claude-code/testing";

import { bash, stop, world, write } from "./flow-fixture";

type Call = { deny?: string };
const run = ($: unknown, args: string) =>
  (
    $ as { command: { run: (i: never) => Promise<{ text?: string }> } }
  ).command.run({
    command: "commitgate",
    args,
  } as never);
const commit = ($: unknown) =>
  bash($ as never, "git commit -m x") as Promise<Call>;

async function medium($: unknown, w: ReturnType<typeof world>) {
  for (const f of ["a", "b", "c", "d"])
    await write($ as never, `/p/app/src/${f}.ts`);
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
  expect(((await bash($ as never, "git status")) as Call).deny).toBeUndefined();
});

// The session root is the main checkout; the task's code is in a worktree under it, which the
// main checkout's git does not see (.git/info/exclude), so its print does not move with it.
const WT = "/p/app/.claude/worktrees/w";
async function worktreeTask($: unknown, w: ReturnType<typeof world>) {
  await stop($ as never); // a clean turn sets the session root's baseline
  for (const f of ["a", "b", "c", "d"])
    await write($ as never, `${WT}/src/${f}.ts`);
  w.later(1000);
}
const commitThere = ($: unknown) =>
  bash($ as never, `cd ${WT} && git commit -m x`) as Promise<Call>;

test("a worktree task is held until checked, whatever the main checkout's print says", async ($, on) => {
  const git = { index: "base", work: "m1" };
  const w = world(on, {}, git);
  await worktreeTask($, w);
  expect((await commitThere($)).deny).toContain("kit commit gate");
  await bash($ as never, `cd ${WT} && npm test`);
  w.later(1000);
  expect((await commitThere($)).deny).toBeUndefined();
  const task = (
    w.store.flowTasks as Record<string, { away?: string; basePrint?: string }>
  ).s1;
  expect(task?.away).toBe(WT);
  expect(task?.basePrint).toBeUndefined();
});

test("another session's edit in the main checkout does not hold a checked worktree task", async ($, on) => {
  const git = { index: "base", work: "m1" };
  const w = world(on, {}, git);
  await worktreeTask($, w);
  await bash($ as never, `cd ${WT} && npm test`);
  w.later(1000);
  git.work = "m2"; // the peer edits the main checkout only
  expect((await commitThere($)).deny).toBeUndefined();
  // An edit in the worktree after the check still opens it again.
  await write($ as never, `${WT}/src/a.ts`);
  w.later(1000);
  expect((await commitThere($)).deny).toContain("kit commit gate");
});

test("a check run in the main checkout does not count for a worktree task", async ($, on) => {
  const git = { index: "base", work: "m1" };
  const w = world(on, {}, git);
  await worktreeTask($, w);
  const ran = (await bash($ as never, "npm test")) as { context?: string[] };
  expect(ran.context?.join("\n")).toContain(`this check ran outside ${WT}`);
  w.later(1000);
  expect((await commitThere($)).deny).toContain("kit commit gate");
  expect((await stop($ as never)).block).toBeDefined();
  // A path that leaves the worktree by `..` is outside it too.
  await bash($ as never, `cd ${WT}/src/../.. && npm test`);
  w.later(1000);
  expect((await commitThere($)).deny).toContain("kit commit gate");
  // A cd that may fail (`;`) or a second one is not followed: it counts nowhere.
  for (const cmd of [
    `cd ${WT}/gone; npm test`,
    `cd ${WT} && cd .. && npm test`,
    `cd ${WT} && command cd .. && npm test`,
    `cd ${WT} && command "cd" .. && npm test`,
  ]) {
    await bash($ as never, cmd);
    w.later(1000);
    expect((await commitThere($)).deny).toContain("kit commit gate");
  }
  // Run where the code is, it counts; a quoted cd too, and "cd" inside a quoted argument.
  await bash(
    $ as never,
    `cd "${WT}" && npm test -- -t "nav; cd .." -t "cd" # cd into the worktree`,
  );
  w.later(1000);
  expect((await commitThere($)).deny).toBeUndefined();
});

// The edit's repo is still being found (git is slow) while the commit or a check comes in.
const pause = () => new Promise<void>((r) => setTimeout(r, 100));
function held(
  git: { hold?: unknown },
  at?: (sub: string | undefined, cwd: string) => boolean,
) {
  let entered!: () => void;
  let release!: () => void;
  const inside = new Promise<void>((r) => (entered = r));
  const until = new Promise<void>((r) => (release = r));
  git.hold = { entered, until, at };
  return { inside, release };
}

test("a commit waits for the first worktree edit's repo to be found", async ($, on) => {
  const git = { index: "base", work: "m1" } as Parameters<typeof world>[2] & {};
  const w = world(on, {}, git);
  await stop($ as never);
  for (const f of ["a", "b", "c"])
    await write($ as never, `/p/app/src/${f}.ts`);
  git.work = "m2";
  await bash($ as never, "npm test");
  w.later(1000);
  const h = held(git);
  const editing = write($ as never, `${WT}/src/d.ts`); // the fourth file: medium now
  await h.inside;
  w.later(1000);
  const committing = commitThere($);
  await Promise.race([committing, pause()]); // the gate gets every chance to run first
  h.release();
  await editing;
  expect((await committing).deny).toContain("kit commit gate");
});

test("a second edit during the lookup does not end a check's wait for it", async ($, on) => {
  const git = { index: "base", work: "m1" } as Parameters<typeof world>[2] & {};
  const w = world(on, {}, git);
  await stop($ as never);
  for (const f of ["a", "b", "c"])
    await write($ as never, `/p/app/src/${f}.ts`);
  w.later(1000);
  const h = held(git);
  const editing = write($ as never, `${WT}/src/d.ts`); // the first in the worktree
  await h.inside;
  await write($ as never, "/p/app/README.md"); // not code: no lookup of its own
  w.later(1000);
  const ran = bash($ as never, "npm test"); // in the main checkout: must not count
  await Promise.race([ran, pause()]);
  h.release();
  await editing;
  await ran;
  w.later(1000);
  expect((await commitThere($)).deny).toContain("kit commit gate");
});

test("a worktree edit that starts while the gate reads the print is judged too", async ($, on) => {
  const git = { index: "base", work: "m1" } as Parameters<typeof world>[2] & {};
  const w = world(on, {}, git);
  await stop($ as never);
  for (const f of ["a", "b", "c", "d"])
    await write($ as never, `/p/app/src/${f}.ts`);
  git.work = "m2";
  await bash($ as never, "npm test");
  w.later(1000);
  const h = held(git, (sub, cwd) => sub === "ls-files" && cwd === "/p/app");
  const committing = commitThere($);
  await h.inside; // the gate is reading the main checkout's print
  await write($ as never, `${WT}/src/e.ts`);
  h.release();
  expect((await committing).deny).toContain("kit commit gate");
});

test("after a worktree task, a new task in the main checkout goes by its print again", async ($, on) => {
  const git = { index: "base", work: "m1" };
  const w = world(on, {}, git);
  await worktreeTask($, w);
  await bash($ as never, `cd ${WT} && npm test`);
  w.later(1000);
  await stop($ as never); // verified: the worktree task ends here
  expect((w.store.flowTasks as Record<string, unknown>).s1).toBeUndefined();
  git.work = "m2"; // a shell edit in the main checkout: only git sees it
  expect((await stop($ as never)).block).toBeDefined();
  const task = (
    w.store.flowTasks as Record<string, { away?: string; basePrint?: string }>
  ).s1;
  expect(task?.away).toBeUndefined();
  expect(task?.basePrint).toBeDefined();
});

test("a worktree task reads its commands from the worktree's AGENTS.md", async ($, on) => {
  const read: string[] = [];
  on("fs.read", async (_$, e) => {
    read.push(String((e as { path?: string }).path));
    return { value: "## Commands\n- Test: `npm test`\n" };
  });
  const git = { index: "base", work: "m1" };
  const w = world(on, {}, git);
  await worktreeTask($, w);
  const task = (
    w.store.flowTasks as Record<
      string,
      { requiredRoot?: string; required?: string[] }
    >
  ).s1;
  expect(task?.requiredRoot).toBe(WT);
  expect(task?.required).toEqual(["test"]);
  expect(read).toContain(`${WT}/AGENTS.md`);
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
