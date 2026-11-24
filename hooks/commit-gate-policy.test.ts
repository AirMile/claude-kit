import { expect, test } from "claude-code/testing";

import { commitBlock, isCommit } from "./commit-gate-policy";
import { newTask, onCheck, type Task } from "./flow-policy";

test("isCommit finds a git commit in command position only", () => {
  for (const cmd of [
    "git commit -m 'x'",
    "git -C app commit -m x",
    "git -c user.name=a commit -m x",
    "npm test && git commit -am x",
    "cd app; git commit",
    "KIT_X=1 git commit -m x",
    "git commit --amend",
    "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\"",
    'git commit -m "feat: add --dry-run flag"',
    'git -c "user.name=Miles Z" commit -m x',
    'GIT_AUTHOR_NAME="Miles Z" git commit -m x',
    "command git commit -m x",
    "time git commit -m x",
    "git.exe commit -m x",
    "git commit;",
    "git commit&&git push",
    "(git commit)",
    "if x; then git commit; fi",
    "git --git-dir x commit",
    "git -P commit -m x",
    "git commit --dry-run && git commit -m x",
    "git commit -m x && git commit --dry-run",
    "git -C dir \\\n  commit -m x",
    'git commit -m "fix \\"bug\\" --dry-run"',
  ])
    expect(isCommit(cmd), cmd).toBe(true);
  for (const cmd of [
    "git log --oneline",
    "echo git commit",
    "git commit-tree abc",
    "git commit --dry-run",
    "git status && git diff",
    "npm run commit",
    "cat <<'EOF' > script.sh\ngit commit -m x\nEOF",
    'echo "git commit"',
  ])
    expect(isCommit(cmd), cmd).toBe(false);
});

const medium = (): Task => ({
  ...newTask(1, "medium", "p0"),
  files: ["src/a.ts"],
  lastEditAt: 5,
});

test("an unverified medium task blocks a commit and names what is missing", () => {
  const block = commitBlock(medium(), "p1");
  expect(block).toContain("kit commit gate");
  expect(block).toContain("a passing check");
  expect(block).toContain("skip verify");
});

test("a verified, light, waived or absent task does not block", () => {
  const checked = onCheck(medium(), true, 6, "p1", "test");
  expect(commitBlock(checked, "p1")).toBeUndefined();
  expect(commitBlock({ ...medium(), track: "light" }, "p1")).toBeUndefined();
  expect(commitBlock({ ...medium(), stopAsked: true }, "p1")).toBeUndefined();
  expect(commitBlock(undefined, "p1")).toBeUndefined();
  expect(commitBlock(newTask(1, "medium", "p0"), "p0")).toBeUndefined();
});

test("a failed check keeps the commit blocked; code edited after the check too", () => {
  expect(
    commitBlock(onCheck(medium(), false, 6, "p1", "test"), "p1"),
  ).toContain("tests failed earlier");
  const checked = onCheck(medium(), true, 6, "p1", "test");
  expect(commitBlock(checked, "p2")).toContain("a passing check");
});

test("a heavy task with a test pass needs a review; without a reviewer the verifier instead", () => {
  const heavy: Task = { ...medium(), track: "heavy" };
  const checked = onCheck(heavy, true, 6, "p1", "test");
  const block = commitBlock(checked, "p1");
  expect(block).not.toContain("kit:verifier");
  expect(block).toContain("a review");
  const noReviewer: Task = {
    ...checked,
    noReviewer: { round: "p1", reason: "GPT has no room" },
  };
  const excused = commitBlock(noReviewer, "p1");
  expect(excused).toContain("kit:verifier");
  expect(excused).not.toContain("a review");
});

test("a failing suite held open blocks the commit; a passing one on the same print does not", () => {
  expect(
    commitBlock(onCheck(medium(), false, 6, "p1", "test"), "p1"),
  ).toContain("tests failed earlier");
  expect(
    commitBlock(onCheck(medium(), true, 6, "p1", "test"), "p1"),
  ).toBeUndefined();
  // a failure on this code, then a pass on the same code, clears it
  const failed = onCheck(medium(), false, 6, "p1", "test");
  expect(
    commitBlock(onCheck(failed, true, 7, "p1", "test"), "p1"),
  ).toBeUndefined();
});

const NONE = "no command this task was recognised as a check";

test("commitBlock says no command was recognised when no check was seen (none or only unrecognised calls)", () => {
  expect(commitBlock(medium(), "p1")).toContain(NONE);
  expect(commitBlock({ ...medium(), shellCalls: 4 }, "p1")).toContain(NONE);
  expect(commitBlock(medium(), "p1")).toContain("`Test:`");
  expect(commitBlock(medium(), "p1")).toContain("node --test");
});

test("commitBlock keeps the old wording for a failing check and for a stale pass", () => {
  const failed = commitBlock(onCheck(medium(), false, 6, "p1", "test"), "p1");
  expect(failed).toContain("tests failed earlier");
  expect(failed).not.toContain(NONE);
  const stale = commitBlock(onCheck(medium(), true, 6, "p1", "test"), "p2");
  expect(stale).toContain("a passing check on this code");
  expect(stale).not.toContain(NONE);
});
