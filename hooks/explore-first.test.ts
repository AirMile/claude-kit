import { expect, test } from "claude-code/testing";

import { EXPLORE_LABELS, exploreNote } from "./explore-first";

test("explore plus a ready delegate adds a note for a question or change", async () => {
  const input = {
    label: EXPLORE_LABELS.explore,
    ready: true,
    build: false,
    thin: false,
    kind: "question" as const,
    change: undefined,
  };
  expect(exploreNote(input)).toContain(
    "start by handing the exploring to mcp__kit__delegate",
  );
  expect(
    exploreNote({ ...input, kind: "routine", change: "medium" }),
  ).toContain("read only the file:line");
  expect(exploreNote({ ...input, label: EXPLORE_LABELS.direct })).toBe(
    undefined,
  );
  expect(exploreNote({ ...input, thin: true })).toBe(undefined);
  expect(exploreNote({ ...input, build: true })).toBe(undefined);
  expect(exploreNote({ ...input, ready: false })).toBe(undefined);
  expect(exploreNote({ ...input, kind: "planning", change: "none" })).toBe(
    undefined,
  );
  expect(exploreNote({ ...input, kind: "routine" })).toBe(undefined);
  expect(exploreNote({ ...input, label: undefined })).toBe(undefined);
});
