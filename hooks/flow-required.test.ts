import { expect, test } from "claude-code/testing";

import { checkOf } from "./flow-check";
import { failureHash, parseRequired, requiredMissing } from "./flow-required";
import {
  newTask,
  onCheck,
  stopVerdict,
  verified,
  type Task,
} from "./flow-policy";

const COMMANDS = `# App

## Commands

- Dev: \`npm run dev\`
- Test: \`npm test\` (single file: \`npm test -- <path>\`)
- Lint / typecheck: \`npm run lint\`
- Build: \`npm run build\`
- Security: —

## Conventions

- Test: not a command here
`;

const edited = (track: "light" | "medium" | "heavy", print = "p0"): Task => ({
  ...newTask(1, track, print),
  files: ["src/a.ts"],
  lastEditAt: 5,
  required: ["test", "static", "build"],
});

test("parseRequired reads the Commands section only", () => {
  expect(parseRequired(COMMANDS)).toEqual(["test", "static", "build"]);
  expect(parseRequired("## Commands\n\n- Lint: `biome check`\n")).toEqual([
    "static",
  ]);
  expect(parseRequired("## Commands\n\nTest: `pytest`\n")).toEqual(["test"]);
});

test("nothing is required without a Commands section or with none/dash values", () => {
  expect(parseRequired("# App\n\nno commands here\n")).toEqual([]);
  expect(
    parseRequired("## Commands\n\n- Test: —\n- Lint: none\n- Build: -\n"),
  ).toEqual([]);
  expect(parseRequired("")).toEqual([]);
});

test("a lint-only pass does not close a medium task that requires tests", () => {
  const t = onCheck(edited("medium"), true, 6, "p1", "static");
  expect(requiredMissing(t, "p1")).toEqual(["test", "build"]);
  expect(verified(t, "p1")).toBe(false);
  expect(stopVerdict(t, "Done.", "p1").block).toContain("test");
});

test("every required kind passing on the latest code closes it", () => {
  let t = edited("medium");
  t = onCheck(t, true, 6, "p1", "static");
  t = onCheck(t, true, 7, "p1", "test");
  t = onCheck(t, true, 8, "p1", "build");
  expect(requiredMissing(t, "p1")).toEqual([]);
  expect(verified(t, "p1")).toBe(true);
});

test("a compound command passing counts every kind in it", () => {
  const check = checkOf("npm run lint && npm test && npm run build");
  expect(check?.kinds).toEqual(["static", "test", "build"]);
  const t = onCheck(edited("medium"), true, 6, "p1", check?.kinds ?? []);
  expect(verified(t, "p1")).toBe(true);
});

test("a compound command failing opens every kind in it", () => {
  const check = checkOf("npm run lint && npm test");
  const t = onCheck(edited("medium"), false, 6, "p1", check?.kinds ?? []);
  expect(t.openKinds).toEqual(["static", "test"]);
});

test("a kind that passed on older code is no evidence after a later edit, even if it never failed", () => {
  let t = edited("medium");
  t = onCheck(t, true, 6, "p1", ["static", "test", "build"]);
  expect(verified(t, "p1")).toBe(true);
  expect(requiredMissing(t, "p2")).toEqual(["test", "static", "build"]);
  // an edit, then only lint passes on the new code
  t = onCheck({ ...t, lastEditAt: 9 }, true, 10, "p2", "static");
  expect(requiredMissing(t, "p2")).toEqual(["test", "build"]);
  expect(verified(t, "p2")).toBe(false);
});

test("without git the pass time after the last edit is the evidence", () => {
  let t = { ...edited("medium", "p0"), basePrint: undefined };
  t = onCheck(t, true, 6, undefined, "static");
  expect(requiredMissing(t, undefined)).toEqual(["test", "build"]);
  t = onCheck(t, true, 7, undefined, ["test", "build"]);
  expect(requiredMissing(t, undefined)).toEqual([]);
  expect(requiredMissing({ ...t, lastEditAt: 8 }, undefined)).toEqual([
    "test",
    "static",
    "build",
  ]);
});

test("light tasks keep a single passing check", () => {
  const t = onCheck(edited("light"), true, 6, "p1", "static");
  expect(requiredMissing(t, "p1")).toEqual([]);
  expect(verified(t, "p1")).toBe(true);
});

const RED = `
 FAIL  src/a.test.ts > adds numbers (12 ms)
 FAIL  src/b.test.ts > parses dates (3.4s)
 Tests: 2 failed, 40 passed
`;

test("failureHash ignores timings and passed counts, and needs failing lines", () => {
  const again = RED.replace("12 ms", "99 ms")
    .replace("3.4s", "1.1s")
    .replace("40 passed", "41 passed");
  expect(failureHash(RED)).toBe(failureHash(again));
  expect(failureHash(RED)).not.toBe(
    failureHash(RED.replace("b.test.ts", "c.test.ts")),
  );
  expect(failureHash("all fine\nnothing red here")).toBeUndefined();
});

test("a failure before any edit is the baseline: the same failure later does not open the kind", () => {
  const pristine: Task = {
    ...newTask(1, "medium", "p0"),
    required: ["test", "static"],
  };
  const base = onCheck(pristine, false, 2, "p0", "test", RED);
  expect(base.baseline?.test).toBeDefined();
  expect(base.openKinds).toEqual([]);
  expect(base.failed).toBe(0);
  let t: Task = { ...base, files: ["src/a.ts"], lastEditAt: 5 };
  t = onCheck(t, false, 6, "p1", "test", RED.replace("12 ms", "20 ms"));
  expect(t.openKinds).toEqual([]);
  t = onCheck(t, true, 7, "p1", "static");
  expect(requiredMissing(t, "p1")).toEqual([]);
  expect(verified(t, "p1")).toBe(true);
});

test("a different failure after a baseline opens the kind as before", () => {
  const base = onCheck(
    { ...newTask(1, "medium", "p0"), required: ["test"] },
    false,
    2,
    "p0",
    "test",
    RED,
  );
  let t: Task = { ...base, files: ["src/a.ts"], lastEditAt: 5 };
  t = onCheck(t, false, 6, "p1", "test", RED.replace("a.test", "z.test"));
  expect(t.openKinds).toEqual(["test"]);
  expect(verified(t, "p1")).toBe(false);
});

test("a failure after the first edit is never a baseline", () => {
  const t = onCheck(edited("medium"), false, 6, "p1", "test", RED);
  expect(t.baseline?.test).toBeUndefined();
  expect(t.openKinds).toEqual(["test"]);
});

test("a later pass clears the baseline", () => {
  const base = onCheck(
    { ...newTask(1, "medium", "p0"), required: ["test"] },
    false,
    2,
    "p0",
    "test",
    RED,
  );
  const t = onCheck(
    { ...base, files: ["src/a.ts"], lastEditAt: 5 },
    true,
    6,
    "p1",
    "test",
  );
  expect(t.baseline?.test).toBeUndefined();
  expect(verified(t, "p1")).toBe(true);
});

test("a baseline-red kind must still run on the latest code: lint alone does not close it", () => {
  const base = onCheck(
    { ...newTask(1, "medium", "p0"), required: ["test", "static"] },
    false,
    2,
    "p0",
    "test",
    RED,
  );
  let t: Task = { ...base, files: ["src/a.ts"], lastEditAt: 5 };
  t = onCheck(t, true, 6, "p1", "static");
  expect(requiredMissing(t, "p1")).toEqual(["test"]);
  expect(verified(t, "p1")).toBe(false);
  // the unchanged failure on the new code is its run
  t = onCheck(t, false, 7, "p1", "test", RED);
  expect(requiredMissing(t, "p1")).toEqual([]);
  expect(verified(t, "p1")).toBe(true);
});

test("a new failure that goes away again closes the kind when only the baseline is left", () => {
  const base = onCheck(
    { ...newTask(1, "medium", "p0"), required: ["test"] },
    false,
    2,
    "p0",
    "test",
    RED,
  );
  let t: Task = { ...base, files: ["src/a.ts"], lastEditAt: 5 };
  t = onCheck(t, false, 6, "p1", "test", RED.replace("a.test", "z.test"));
  expect(t.openKinds).toEqual(["test"]);
  t = onCheck({ ...t, lastEditAt: 7 }, false, 8, "p2", "test", RED);
  expect(t.openKinds).toEqual([]);
  expect(verified(t, "p2")).toBe(true);
});

test("a compound run is never recorded as a baseline", () => {
  const t = onCheck(
    { ...newTask(1, "medium", "p0"), required: ["test", "static"] },
    false,
    2,
    "p0",
    ["static", "test"],
    RED,
  );
  expect(t.baseline?.test).toBeUndefined();
  expect(t.baseline?.static).toBeUndefined();
  expect(t.openKinds).toEqual(["static", "test"]);
});

test("a command flow cannot recognise as a check is not required", () => {
  expect(
    parseRequired(
      "## Commands\n\n- Test: `./scripts/test.sh`\n- Lint: `npm run lint`\n- Typecheck: `tsc --noEmit`\n",
    ),
  ).toEqual(["static"]);
});

test("the hold text names a baseline-red kind as pre-existing", () => {
  const base = onCheck(
    { ...newTask(1, "medium", "p0"), required: ["test", "static"] },
    false,
    2,
    "p0",
    "test",
    RED,
  );
  const t: Task = { ...base, files: ["src/a.ts"], lastEditAt: 5 };
  const block = stopVerdict(t, "Done.", "p1").block;
  expect(block).toContain("Pre-existing, unchanged failures");
  expect(block).toContain("test");
});

test("the hold names which AGENTS.md lists a required check", () => {
  const t: Task = {
    ...newTask(1, "medium"),
    required: ["static"],
    files: ["/w/claude-kit/hooks/a.ts"],
    lastEditAt: 5,
    lastCheckAt: 6,
  };
  expect(
    stopVerdict({ ...t, requiredRoot: "/w/codemap/" }, "Done.", undefined).block,
  ).toContain("(/w/codemap/AGENTS.md lists it)");
  // a task stored before the root was kept
  expect(stopVerdict(t, "Done.", undefined).block).toContain(
    "(this project's AGENTS.md lists it)",
  );
});
