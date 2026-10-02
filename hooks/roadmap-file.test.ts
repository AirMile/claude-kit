import { expect, test } from "claude-code/testing";

import {
  add,
  addLater,
  movePhase,
  parse,
  remove,
  restore,
  toLater,
} from "./roadmap-file";

const ROADMAP = `<!-- format: items under phase headings, one line per item, order = priority.
## Phase <n> · <name>
- [ ] **slug** · one-line description -->

# Roadmap

## Phase 1 · MVP

- [x] **scaffold** · project skeleton · spec: docs/specs/scaffold.md
- [ ] **demo** · daily check-off · spec: docs/specs/demo.md
- [ ] **reminders** · daily reminder

## Phase 2 · Growth

- [ ] **stats** · weekly charts
- [ ] **sharing** · share a list

## Later

- export to CSV
`;

test("parse skips the format comment and reads phases, items and later", async () => {
  const r = parse(ROADMAP);
  expect(r.phases).toEqual(["Phase 1 · MVP", "Phase 2 · Growth"]);
  expect(r.items.map((i) => i.slug)).toEqual([
    "scaffold",
    "demo",
    "reminders",
    "stats",
    "sharing",
  ]);
  expect(r.items[1]?.spec).toBe("docs/specs/demo.md");
  expect(r.items[3]?.phase).toBe("Phase 2 · Growth");
  expect(r.later).toEqual(["export to CSV"]);
});

test("remove changes only its own line", async () => {
  expect(remove(ROADMAP, "sharing")).toBe(
    ROADMAP.replace("- [ ] **sharing** · share a list\n", ""),
  );
});

test("add, movePhase and toLater land in the right place", async () => {
  const added = parse(add(ROADMAP, "Phase 2 · Growth", "Dark mode toggle"));
  expect(added.items.at(-1)).toMatchObject({
    slug: "dark-mode-toggle",
    phase: "Phase 2 · Growth",
  });
  const moved = parse(movePhase(ROADMAP, "reminders", "Phase 2 · Growth"));
  expect(moved.items.find((i) => i.slug === "reminders")?.phase).toBe(
    "Phase 2 · Growth",
  );
  expect(parse(toLater(ROADMAP, "sharing")).later).toEqual([
    "export to CSV",
    "sharing: share a list",
  ]);
});

test("restore puts a Later idea back, as a slug when it has one", async () => {
  const shelved = toLater(ROADMAP, "sharing");
  const back = parse(restore(shelved, 1, "Phase 1 · MVP"));
  expect(back.later).toEqual(["export to CSV"]);
  expect(back.items.find((i) => i.slug === "sharing")).toMatchObject({
    phase: "Phase 1 · MVP",
    description: "share a list",
  });
  expect(
    parse(restore(ROADMAP, 0, "Phase 2 · Growth")).items.at(-1)?.slug,
  ).toBe("export-to-csv");
});

test("done and in-progress items are refused", async () => {
  expect(() => movePhase(ROADMAP, "scaffold", "Phase 2 · Growth")).toThrow();
  expect(() => remove(ROADMAP, "demo")).toThrow();
});

test("addLater appends an idea, and makes ## Later when missing", async () => {
  expect(parse(addLater(ROADMAP, "  offline mode ")).later).toEqual([
    "export to CSV",
    "offline mode",
  ]);
  const bare = ROADMAP.slice(0, ROADMAP.indexOf("## Later"));
  expect(parse(addLater(bare, "offline mode")).later).toEqual(["offline mode"]);
  expect(() => addLater(ROADMAP, "  ")).toThrow("empty idea");
});
