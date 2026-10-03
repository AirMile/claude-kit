import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import {
  duplicate,
  lines,
  newId,
  type Point,
  statusText,
  summary,
  validate,
} from "./feedback";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 12);
const p = (
  skill: string,
  text: string,
  at: number,
  project = "/p/app",
): Point => ({
  skill,
  text,
  project,
  at,
});
const INBOX: Record<string, Point> = {
  b: p("commit", "Push question is auto-decidable", T0 + DAY),
  a: p("build", "Size gate asks twice", T0),
  c: p("build", "Verify skips the dev server", T0 + 2 * DAY, "C:\\work\\shop"),
};

test("validate accepts the three actions and trims their fields", async () => {
  expect(validate({ action: "add", skill: " build ", text: " x  y " })).toEqual(
    {
      action: "add",
      skill: "build",
      text: "x  y",
    },
  );
  expect(validate({ action: "list" })).toEqual({ action: "list" });
  expect(validate({ action: "list", skill: "build" })).toEqual({
    action: "list",
    skill: "build",
  });
  expect(validate({ action: "done", ids: ["#a", "b"] })).toEqual({
    action: "done",
    ids: ["a", "b"],
  });
});

test("validate names what is wrong", async () => {
  expect(validate({ action: "drop" })).toMatch(/action/);
  expect(validate({})).toMatch(/action/);
  expect(validate({ action: "add", skill: " ", text: "x" })).toMatch(/skill/);
  expect(validate({ action: "add", skill: "build" })).toMatch(/text/);
  expect(
    validate({ action: "add", skill: "build", text: "x".repeat(501) }),
  ).toMatch(/500/);
  expect(validate({ action: "list", skill: 3 })).toMatch(/skill/);
  expect(validate({ action: "done", ids: "a" })).toMatch(/ids/);
  expect(validate({ action: "done", ids: [] })).toMatch(/ids/);
  expect(validate({ action: "done", ids: ["a", 2] })).toMatch(/ids/);
});

test("duplicate matches skill and normalised text only", async () => {
  expect(duplicate(INBOX, "build", "  size GATE   asks\ttwice ")).toBe("a");
  expect(duplicate(INBOX, "commit", "Size gate asks twice")).toBeNull();
  expect(duplicate({}, "build", "x")).toBeNull();
});

test("lines lists open points oldest first, optionally for one skill", async () => {
  expect(lines(INBOX)).toBe(
    [
      "#a · build · app · 2026-10-01 · Size gate asks twice",
      "#b · commit · app · 2026-10-02 · Push question is auto-decidable",
      "#c · build · shop · 2026-10-03 · Verify skips the dev server",
    ].join("\n"),
  );
  expect(lines(INBOX, "commit")).toBe(
    "#b · commit · app · 2026-10-02 · Push question is auto-decidable",
  );
  expect(lines({})).toBe("Inbox empty");
  expect(lines(INBOX, "theme")).toBe("Inbox empty for theme");
});

test("summary and statusText name the skill with the most open points", async () => {
  expect(summary(INBOX)).toEqual({ count: 3, top: "build" });
  expect(summary({})).toEqual({ count: 0, top: null });
  expect(statusText(INBOX)).toBe("3 feedback points · /improve build");
  expect(statusText({ b: INBOX.b! })).toBe(
    "1 feedback point · /improve commit",
  );
  expect(statusText({})).toBeUndefined();
  // A tie goes to the skill whose oldest point waited longest.
  expect(summary({ b: INBOX.b!, c: INBOX.c! }).top).toBe("commit");
});

test("newId is short, lower-case and differs per call", async () => {
  const one = newId(T0, 0.1);
  expect(one).toMatch(/^[a-z0-9]{6,12}$/);
  expect(newId(T0, 0.2)).not.toBe(one);
  expect(newId(T0 + 1, 0.1)).not.toBe(one);
});

// The tool end to end, over an in-memory store.
function world(on: On, root: string) {
  mock.store(on);
  mock.clock(on, { now: T0 });
  const status: (string | undefined)[] = [];
  on("session.root", async () => ({ value: root }));
  on("fs.read", async (_$, e) => {
    if (e.path === "/p/kit/.claude-plugin/plugin.json")
      return { value: JSON.stringify({ name: "kit", version: "0.4.1" }) };
    throw new Error("ENOENT");
  });
  on("ui.status", async (_$, e) => {
    status.push(e.text);
    return { value: undefined };
  });
  return status;
}
const call = (input: Record<string, unknown>) => ({
  tool: "mcp__kit__feedback" as const,
  ...input,
});
const text = (r: { result?: unknown }) => String(r.result);

test("add, list and done round-trip; the status line follows in a kit checkout", async ($, on) => {
  const status = world(on, "/p/kit");
  const added = await $.tool.call(
    call({ action: "add", skill: "build", text: "Size gate asks twice" }),
  );
  expect(text(added)).toMatch(/^Recorded #[a-z0-9]+ · build: 1 open$/);
  const id = /#([a-z0-9]+)/.exec(text(added))![1]!;
  expect(status.at(-1)).toBe("1 feedback point · /improve build");

  const again = await $.tool.call(
    call({ action: "add", skill: "build", text: "size gate ASKS twice" }),
  );
  expect(text(again)).toBe(`Already open as #${id} · build`);

  const listed = await $.tool.call(call({ action: "list" }));
  expect(text(listed)).toBe(
    `#${id} · build · kit · 2026-10-01 · Size gate asks twice`,
  );

  const done = await $.tool.call(
    call({ action: "done", ids: [`#${id}`, "nope"] }),
  );
  expect(text(done)).toBe("Closed 1 · unknown: #nope");
  expect(text(await $.tool.call(call({ action: "list" })))).toBe("Inbox empty");
  expect(status.at(-1)).toBeUndefined();
});

test("outside a kit checkout the status line stays clear", async ($, on) => {
  const status = world(on, "/p/app");
  await $.tool.call(call({ action: "add", skill: "commit", text: "x" }));
  expect(status.length).toBeGreaterThan(0);
  expect(status.every((s) => s === undefined)).toBe(true);
});

test("invalid input stores nothing", async ($, on) => {
  world(on, "/p/kit");
  expect(
    text(await $.tool.call(call({ action: "add", skill: "build" }))),
  ).toMatch(/text/);
  expect(text(await $.tool.call(call({ action: "list" })))).toBe("Inbox empty");
});

test("a failing store is reported, not thrown", async ($, on) => {
  on("store.keys", async () => {
    throw new Error("disk full");
  });
  on("session.root", async () => ({ value: "/p/app" }));
  on("ui.status", async () => ({ value: undefined }));
  const r = await $.tool.call(call({ action: "list" }));
  expect(text(r)).toMatch(/^kit: inbox unavailable \(.+\)$/);
});

test("the tool runs without a permission prompt", async ($, on) => {
  world(on, "/p/app");
  const check = { tool: "mcp__kit__feedback", input: { action: "list" } };
  expect(await $.tool.check(check)).toEqual({ decision: "allow" });
});

test("a failing write is reported, not thrown", async ($, on) => {
  mock.clock(on, { now: T0 });
  on("store.keys", async () => ({ value: [] }));
  on("store.set", async () => {
    throw new Error("read-only");
  });
  on("session.root", async () => ({ value: "/p/app" }));
  on("ui.status", async () => ({ value: undefined }));
  const r = await $.tool.call(call({ action: "add", skill: "build", text: "x" }));
  expect(text(r)).toMatch(/^kit: inbox unavailable \(.+\)$/);
});
