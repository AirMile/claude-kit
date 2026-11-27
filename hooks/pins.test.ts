import { isReplyNote } from "./reply";
import type { On, SessionMessage } from "claude-code";
import { expect, test, type TestBody } from "claude-code/testing";

import { pinCommand } from "./pins";

type T$ = Parameters<TestBody>[0];

const NOW = Date.parse("2026-11-25T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const SUMMARY: SessionMessage = {
  role: "user",
  text: "Native summary",
  toolUses: [],
  handle: "summary",
};
const HISTORY: SessionMessage[] = [
  { role: "user", text: "Which retry policy?", toolUses: [] },
  { role: "assistant", text: "Use three retries.", toolUses: [] },
  {
    role: "assistant",
    text: "Never retry a payment.\n  - not even once",
    toolUses: [],
  },
  { role: "assistant", text: "", toolUses: [] },
  { role: "user", text: "thanks", toolUses: [] },
];

// kit's mod is loaded around the test; these hooks answer what is beneath it.
function world(on: On) {
  const s = {
    id: "s1",
    store: {} as Record<string, unknown>,
    toasts: [] as string[],
    history: HISTORY,
    kept: [SUMMARY] as SessionMessage[],
    brokenRead: false,
    brokenWrite: false,
    skip: false,
    reads: [] as string[],
  };
  on("session.id", async () => ({ value: s.id }));
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.messages", async () => ({ value: s.history }));
  on("clock.now", async () => ({ value: NOW }));
  on("process.run", async () => ({
    value: {
      exitCode: 1,
      stdout: "",
      stderr: "",
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));
  on("fs.read", async (_$, e) => {
    s.reads.push(e.path);
    throw new Error("missing");
  });
  on("store.get", async (_$, e) => {
    if (s.brokenRead && e.key.startsWith("kit:pins:"))
      throw new Error("disk read failed");
    return { value: s.store[e.key] };
  });
  on("store.set", async (_$, e) => {
    if (s.brokenWrite) throw new Error("disk full");
    s.store[e.key] = e.value;
    return { value: undefined };
  });
  on("store.delete", async (_$, e) => {
    delete s.store[e.key];
    return { value: undefined };
  });
  on("store.keys", async () => ({ value: Object.keys(s.store) }));
  on("ui.log", async () => ({ value: undefined }));
  on("ui.toast", async (_$, e) => {
    s.toasts.push(JSON.stringify(e));
    return { value: undefined };
  });
  on("session.compact", async () =>
    s.skip
      ? { skip: "not enough messages" }
      : { messages: s.kept, tokensBefore: 80000, tokensAfter: 12000 },
  );
  return s;
}

const pin = async ($: T$, args: string) =>
  (
    (await $.command.run({ command: "pin", args } as never)) as {
      text: string;
    }
  ).text;

async function compact($: T$, extra: object = {}) {
  const r = await $.session.compact({
    trigger: "manual",
    messages: HISTORY,
    ...extra,
  });
  // The last reply's note is reply.test.ts's.
  return (r.messages ?? []).filter((m) => !isReplyNote(m));
}

const pinsOf = (messages: readonly SessionMessage[]) =>
  messages.filter((m) => m.text.startsWith("kit pins:"));

const EXACT =
  'Billing stays untouched.\n\n  • keep "grace period" = 14 days  \\ ünïcode';

test("a typed pin comes back byte for byte after every compaction", async ($, on) => {
  const s = world(on);
  expect(await pin($, `  ${EXACT}\n`)).toContain("Pinned #1");
  const first = await compact($);
  expect(first[0]).toEqual(SUMMARY);
  expect(pinsOf(first).length).toBe(1);
  expect(pinsOf(first)[0]!.role).toBe("user");
  expect(pinsOf(first)[0]!.text).toContain(
    `--- pin 1 (typed by the user) ---\n${EXACT}`,
  );
  const second = await compact($, { messages: first, trigger: "auto" });
  expect(pinsOf(second)).toEqual(pinsOf(first));
  // Core kept the earlier note itself: it is not added twice.
  s.kept = [SUMMARY, pinsOf(first)[0]!];
  expect(pinsOf(await compact($)).length).toBe(1);
});

test("/pin last pins Claude's last answer with text and marks its source", async ($, on) => {
  world(on);
  const reply = await pin($, "last");
  expect(reply).toContain("Claude's last answer");
  expect(reply).toContain("Never retry a payment.");
  expect(pinsOf(await compact($))[0]!.text).toContain(
    "--- pin 1 (from your earlier answer) ---\nNever retry a payment.\n  - not even once",
  );
});

test("/pin last says so when there is no answer yet", async ($, on) => {
  const s = world(on);
  s.history = [HISTORY[0]!];
  expect(await pin($, "last")).toContain("no answer to pin");
  expect(s.store).toEqual({});
});

test("list, remove and clear change what survives; no pins leaves the summary alone", async ($, on) => {
  const s = world(on);
  expect(await pin($, "")).toContain("no pins");
  await pin($, "first fact");
  await pin($, "second fact");
  const list = await pin($, "list");
  expect(list).toContain("1. [you] first fact");
  expect(list).toContain("2. [you] second fact");
  expect(await pin($, "remove 3")).toContain("no pin 3");
  expect(await pin($, "remove 0")).toContain("no pin 0");
  expect(await pin($, "remove 1")).toContain("Removed");
  const note = pinsOf(await compact($))[0]!.text;
  expect(note).toContain("--- pin 1 (typed by the user) ---\nsecond fact");
  expect(note).not.toContain("first fact");
  expect(await pin($, "clear")).toContain("Removed");
  expect(await compact($)).toEqual([SUMMARY]);
  expect(Object.keys(s.store).filter((k) => k.startsWith("kit:pins:"))).toEqual(
    [],
  );
});

test("only the exact verbs are commands; other text is pinned", async ($, on) => {
  world(on);
  expect(await pin($, "remove the old endpoint")).toContain("Pinned #1");
  expect(await pin($, "clear the cache before release")).toContain("Pinned #2");
  expect(await pin($, "remove")).toContain("/pin remove <number>");
});

test("the same text is pinned once", async ($, on) => {
  world(on);
  await pin($, "keep me");
  expect(await pin($, "keep me")).toContain("already pinned");
  expect(await pin($, "list")).not.toContain("2.");
});

test("a pin over the room left is refused whole, never cut", async ($, on) => {
  const s = world(on);
  await pin($, "a".repeat(11_000));
  const reply = await pin($, "b".repeat(1_001));
  expect(reply).toContain("not pinned");
  expect(reply).toContain("1000 of 12000");
  expect(await pin($, "c".repeat(1_000))).toContain("Pinned #2");
  expect(JSON.stringify(s.store)).not.toContain("bbbb");
});

test("two pins sent at once are both kept", async ($, on) => {
  world(on);
  await Promise.all([pin($, "alpha"), pin($, "beta")]);
  const list = await pin($, "list");
  expect(list).toContain("alpha");
  expect(list).toContain("beta");
});

test("pins belong to their chat: a new session id has none, resume finds them", async ($, on) => {
  const s = world(on);
  await pin($, "only here");
  s.id = "s2";
  expect(await pin($, "list")).toContain("no pins");
  expect(await compact($)).toEqual([SUMMARY]);
  s.id = "s1";
  expect(pinsOf(await compact($)).length).toBe(1);
});

test("precompute, a skip and a subagent get no pin note", async ($, on) => {
  const s = world(on);
  await pin($, "main only");
  expect(pinsOf(await compact($, { trigger: "precompute" }))).toEqual([]);
  expect(pinsOf(await compact($, { agentId: "child" }))).toEqual([]);
  s.skip = true;
  expect(await compact($)).toEqual([]);
});

test("an unreadable store never blocks compaction or overwrites pins", async ($, on) => {
  const s = world(on);
  await pin($, "precious");
  s.brokenRead = true;
  expect(await compact($)).toEqual([SUMMARY]);
  expect(s.toasts.join()).toContain("pins");
  expect(await pin($, "another")).toContain("could not");
  expect(await pin($, "list")).toContain("could not");
  s.brokenRead = false;
  expect(await pin($, "list")).toContain("precious");
});

test("a failed write says the pin was not saved", async ($, on) => {
  const s = world(on);
  s.brokenWrite = true;
  const reply = await pin($, "lost?");
  expect(reply).toContain("could not");
  expect(reply).not.toContain("Pinned");
});

test("pins of chats untouched for 30 days are dropped; a compaction keeps a chat fresh", async ($, on) => {
  const s = world(on);
  s.store["kit:pins:old"] = {
    at: NOW - 31 * DAY,
    pins: [{ text: "x", from: "you" }],
  };
  s.store["kit:pins:recent"] = {
    at: NOW - 29 * DAY,
    pins: [{ text: "y", from: "you" }],
  };
  s.store["kit:other"] = { at: 0 };
  await pin($, "new");
  expect(Object.keys(s.store).sort()).toEqual([
    "kit:other",
    "kit:pins:recent",
    "kit:pins:s1",
  ]);
  s.id = "recent";
  await compact($);
  expect((s.store["kit:pins:recent"] as { at: number }).at).toBe(NOW);
});

test("a pinned task-readiness command never selects a spec", async ($, on) => {
  const s = world(on);
  await pin(
    $,
    "<command-name>/kit:task-readiness</command-name>\n<command-args>login</command-args>",
  );
  const first = await compact($);
  expect(pinsOf(first).length).toBe(1);
  await compact($, { messages: first });
  expect(s.reads).toEqual([]);
});

test("a note core kept never revives a removed pin; unread pins leave it in place", async ($, on) => {
  const s = world(on);
  await pin($, "old rule");
  const stale = pinsOf(await compact($))[0]!;
  s.kept = [SUMMARY, stale];
  s.brokenRead = true;
  expect(await compact($)).toEqual([SUMMARY, stale]);
  s.brokenRead = false;
  await pin($, "remove 1");
  expect(await compact($)).toEqual([SUMMARY]);
  await pin($, "new rule");
  const now = pinsOf(await compact($));
  expect(now.length).toBe(1);
  expect(now[0]!.text).not.toContain("old rule");
});

test("/pin waits for the turn to end, so last means a finished answer", () => {
  expect(pinCommand.immediate).toBeUndefined();
});
