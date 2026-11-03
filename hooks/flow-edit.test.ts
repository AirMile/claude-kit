import { expect, test } from "claude-code/testing";

import { isSource, newTask, onEdit, type Task } from "./flow-policy";

test("edits grow the track at 4 and 9 files or on a migration; a spec marks the task", async () => {
  let t: Task | undefined;
  for (const f of ["a.ts", "b.ts", "c.ts"])
    t = onEdit(t, `src/${f}`, 1, 1, "p0")?.task;
  expect(t?.track).toBe("light"); // work outside a task starts a light one
  expect(t?.basePrint).toBe("p0");
  const four = onEdit(t, "src/d.ts", 2, 1, "p0");
  expect(four?.note).toContain("grew from light to medium");
  expect(onEdit(t, "db/migrations/001_users.sql", 2, 1, "p0")?.task.track).toBe(
    "heavy",
  );
  expect(onEdit(t, "docs/specs/login.md", 2, 1, "p0")?.task.spec).toBe(true);
  expect(onEdit(undefined, "docs/guide.md", 1, 1, "p0")).toBe(undefined);
  expect(isSource(".github/workflows/ci.yml")).toBe(true);
  expect(isSource("pages/intro.mdx")).toBe(true);
});

test("only source edits set writers and the GPT parameter stays optional", async () => {
  const t = newTask(1, "light");
  expect(
    onEdit(t, "docs/specs/a.md", 1, 1, undefined, true)?.task.gptWrote,
  ).toBe(undefined);
  expect(onEdit(t, "docs/guide.md", 1, 1, undefined)?.task.claudeWrote).toBe(
    undefined,
  );
  const gpt = onEdit(t, "src/a.ts", 1, 1, undefined, true)!.task;
  expect(gpt.gptWrote).toBe(true);
  expect(gpt.claudeWrote).toBe(undefined);
  const both = onEdit(gpt, "src/a.ts", 2, 1, undefined)!.task;
  expect(both.gptWrote).toBe(true);
  expect(both.claudeWrote).toBe(true);
  expect(t.lastEditAt).toBe(0);
});
