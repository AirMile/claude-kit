import { expect, test } from "claude-code/testing";

import { inRoot } from "./spec";

test("inRoot resolves project paths against the root, not the shell's cwd", async () => {
  expect(inRoot("/p/app", "docs/roadmap.md")).toBe("/p/app/docs/roadmap.md");
  expect(inRoot("/p/app/", "AGENTS.md")).toBe("/p/app/AGENTS.md");
  expect(inRoot("C:\\p\\app", "docs/x.md")).toBe("C:\\p\\app/docs/x.md");
  expect(inRoot("/p/app", "/tmp/x.md")).toBe("/tmp/x.md");
  expect(inRoot("/p/app", "C:\\x.md")).toBe("C:\\x.md");
});
