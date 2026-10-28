import { expect, test } from "claude-code/testing";

import { countRead, isExplore, readBudget } from "./read-budget";

test("only read tools and wholly reading shell commands count", async () => {
  for (const tool of ["Read", "Grep", "Glob"])
    expect(isExplore(tool)).toBe(true);
  for (const command of [
    "cat a.ts && head b.ts || tail c.ts; rg foo | wc -l",
    "sed -n '1,50p' a.ts",
    "grep foo a.ts",
    "find hooks -name '*.ts'",
    "ls hooks",
    "git show HEAD:hooks/flow.ts",
    "git log -5",
    "git diff",
    "git status",
    "git grep foo",
  ])
    expect(isExplore("Bash", command)).toBe(true);
  for (const command of [
    "",
    "npm test",
    "npm test | tail -5",
    "rg foo && npm run check",
    "sed -i s/a/b/ a.ts",
    "cat a.ts && touch b.ts",
    "git diff; git commit -am fix",
    "cat a.ts > b.ts",
    "cat $(touch x)",
  ])
    expect(isExplore("Bash", command)).toBe(false);
  for (const tool of ["Edit", "Write", "Agent", "mcp__kit__delegate"])
    expect(isExplore(tool)).toBe(false);
});

test("five calls or 15000 characters send one note per prompt", async () => {
  const calls = readBudget();
  for (let i = 0; i < 4; i++)
    expect(countRead(calls, 10, false)).toBe(undefined);
  expect(countRead(calls, 10, false)).toContain("read 5 times (50 characters)");
  expect(countRead(calls, 20000, false)).toBe(undefined);
  const chars = readBudget();
  expect(countRead(chars, 14999, false)).toBe(undefined);
  expect(countRead(chars, 1, false)).toContain(
    "read 2 times (15000 characters)",
  );
  expect(countRead(readBudget(), 15000, false)).toContain("read 1 times");
});

test("leaning lowers the budget to four calls or 10000 characters; reset starts fresh", async () => {
  const calls = readBudget();
  for (let i = 0; i < 3; i++) expect(countRead(calls, 0, true)).toBe(undefined);
  expect(countRead(calls, 0, true)).toContain("read 4 times");
  expect(countRead(calls, 0, true)).toBe(undefined);
  const chars = readBudget();
  expect(countRead(chars, 9999, true)).toBe(undefined);
  expect(countRead(chars, 1, true)).toContain("10000 characters");
  expect(countRead(readBudget(), 1, true)).toBe(undefined);
});
