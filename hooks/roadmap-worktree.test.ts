import { expect, test } from "claude-code/testing";

import { away, claims, failure, SENT_TTL, worktrees } from "./roadmap-worktree";

const LOG = [
  "refs/heads/claude/great-hypatia",
  "",
  "docs/specs/dark-mode.md",
  "",
  "refs/remotes/origin/feat/search",
  "",
  "docs/specs/search.md",
  "docs/specs/dark-mode.md",
  "refs/tags/v1",
  "",
  "docs/specs/tagged.md",
  "refs/remotes/origin/HEAD",
  "",
  "docs/specs/head.md",
  "refs/heads/feat/nested",
  "docs/specs/old/nested.md",
].join("\n");

test("claims maps each spec to the newest branch that touched it", async () => {
  expect(claims(LOG)).toEqual({
    "dark-mode": "claude/great-hypatia",
    search: "origin/feat/search",
  });
  expect(claims("")).toEqual({});
  expect(claims("refs/heads/x\r\n\r\ndocs/specs/a.md\r\n")).toEqual({ a: "x" });
});

test("away: a claim beats a mark and ends it; a mark expires after SENT_TTL", async () => {
  const now = 10 * SENT_TTL;
  const r = away(
    ["a", "b", "c", "d"],
    { a: "claude/x" },
    { a: now - 5, b: now - 5, c: now - SENT_TTL, gone: now },
    now,
  );
  expect(r.lines).toEqual({ a: "runs on claude/x", b: "sent to worktree" });
  expect(r.keep).toEqual({ b: now - 5 });
});

test("worktrees maps each checked-out branch to its path", async () => {
  const out = [
    "worktree /p/app",
    "HEAD abc",
    "branch refs/heads/main",
    "",
    "worktree /p/app/.claude/worktrees/x",
    "HEAD def",
    "branch refs/heads/claude/x",
    "",
    "worktree /p/detached",
    "HEAD 123",
    "detached",
  ].join("\n");
  expect(worktrees(out)).toEqual({
    main: "/p/app",
    "claude/x": "/p/app/.claude/worktrees/x",
  });
});

test("away points a claim checked out here at its worktree's spec", async () => {
  const r = away(["a", "b"], { a: "claude/x", b: "origin/feat/b" }, {}, 0, {
    "claude/x": "/w/x",
  });
  expect(r.specs).toEqual({ a: "/w/x/docs/specs/a.md" });
  expect(r.lines).toEqual({
    a: "runs on claude/x",
    b: "runs on origin/feat/b",
  });
});

test("failure reads why spawn_task refused, or null when it raised the chip", async () => {
  expect(failure({ isError: false, content: [] })).toBe(null);
  expect(
    failure({
      isError: true,
      content: [{ type: "text", text: " no server " }],
    }),
  ).toBe("no server");
  expect(failure({ isError: true, content: [{ type: "image" }] })).toBe(
    "spawn_task refused",
  );
});
