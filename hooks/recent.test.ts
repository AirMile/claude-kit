import { isReplyNote } from "./reply";
import type { On, SessionMessage } from "claude-code";
import { expect, test, type TestBody } from "claude-code/testing";

type T$ = Parameters<TestBody>[0];

const NOW = Date.parse("2026-11-25T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const SUMMARY: SessionMessage = {
  role: "user",
  text: "Native summary: the user said ja to the retry plan.",
  toolUses: [],
  handle: "summary",
};
const HISTORY: SessionMessage[] = [
  { role: "user", text: "Which retry policy?", toolUses: [] },
  { role: "assistant", text: "Use three retries.", toolUses: [] },
];

// kit's mod is loaded around the test; these hooks answer what is beneath it.
function world(on: On) {
  const s = {
    id: "s1",
    store: {} as Record<string, unknown>,
    kept: [SUMMARY] as SessionMessage[],
    brokenRead: false,
    brokenWrite: false,
    drop: undefined as string | undefined,
    skip: false,
    reads: [] as string[],
  };
  on("session.id", async () => ({ value: s.id }));
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.model", async () => ({ value: "claude-opus-5-5" }));
  on("session.turns", async () => ({ value: 3 }));
  on("session.usage", async () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }));
  on("clock.now", async () => ({ value: NOW }));
  on("clock.after", async () => ({ value: undefined }));
  on("model.classify", async () => ({ value: "question" }));
  on("model.complete", async () => ({ value: "" }) as never);
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
    if (s.brokenRead && e.key.startsWith("kit:recent:"))
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
  on("ui.toast", async () => ({ value: undefined }));
  on("ui.invalidate", async () => ({ value: undefined }));
  on("prompt.submit", async (_$, e) =>
    s.drop ? { drop: s.drop } : { text: e.text },
  );
  on("session.compact", async () =>
    s.skip
      ? { skip: "not enough messages" }
      : { messages: s.kept, tokensBefore: 80000, tokensAfter: 12000 },
  );
  return s;
}

const send = ($: T$, text: string, extra: object = {}) =>
  $.prompt.submit({ text, origin: { kind: "sdk" }, ...extra } as never);

async function compact($: T$, extra: object = {}) {
  const r = await $.session.compact({
    trigger: "manual",
    messages: HISTORY,
    ...extra,
  });
  // The last reply's note is reply.test.ts's.
  return (r.messages ?? []).filter((m) => !isReplyNote(m));
}

const notesOf = (messages: readonly SessionMessage[]) =>
  messages.filter((m) => m.text.startsWith("kit recent messages:"));
const noteText = async ($: T$) => notesOf(await compact($))[0]?.text ?? "";

const EXACT =
  'Billing stays untouched.\n\n  • keep "grace period" = 14 days  \\ ünïcode';

test("the user's prompts come back word for word, oldest first, before the pins", async ($, on) => {
  world(on);
  await send($, EXACT, { origin: { kind: "composer" } });
  await send($, "from my phone", { origin: { kind: "bridge" } });
  await send($, "from the host");
  await $.command.run({ command: "pin", args: "a pin" } as never);
  const after = await compact($);
  expect(after[0]).toEqual(SUMMARY);
  expect(after[1]!.role).toBe("user");
  expect(after[1]!.text).toStartWith("kit recent messages:");
  expect(after[2]!.text).toStartWith("kit pins:");
  const note = after[1]!.text;
  expect(note).toContain("may already be handled");
  expect(note).toContain("approval");
  expect(note).toContain(`--- message ---\n${EXACT}`);
  expect(note.indexOf("ünïcode")).toBeLessThan(note.indexOf("my phone"));
  expect(note.indexOf("my phone")).toBeLessThan(note.indexOf("the host"));
});

test("only what the user sent counts: no events, other senders or bare commands", async ($, on) => {
  world(on);
  for (const kind of [
    "task-notification",
    "scheduled-trigger",
    "peer",
    "auto-continuation",
  ])
    await send($, `from ${kind}`, { origin: { kind } });
  await send($, "from a plugin", {
    origin: { kind: "plugin", name: "other" },
  });
  await send($, "hidden", { isMeta: true });
  await send($, "<ci-monitor-event>checks failed</ci-monitor-event>");
  await send($, '  <task-notification id="1">done</task-notification>');
  await send($, "/kit:commit", { command: { name: "kit:commit", args: "" } });
  expect(await compact($)).toEqual([SUMMARY]);
  await send($, "/kit:product a shop for bikes", {
    command: { name: "kit:product", args: "a shop for bikes" },
  });
  await send($, "<div>why is this div wrong?</div>");
  const note = await noteText($);
  expect(note).toContain("a shop for bikes");
  expect(note).toContain("why is this div wrong?");
});

test("a prompt that did not enter is not noted", async ($, on) => {
  const s = world(on);
  s.drop = "refused";
  await send($, "never sent");
  expect(await compact($)).toEqual([SUMMARY]);
});

test("a message core kept is not repeated; a short one the summary only quotes still is", async ($, on) => {
  const s = world(on);
  await send($, "ja");
  await send($, "second message");
  s.kept = [SUMMARY, { role: "user", text: "second message", toolUses: [] }];
  const note = await noteText($);
  expect(note).toContain("--- message ---\nja");
  expect(note).not.toContain("second message");
});

test("when core kept every message there is no note, and an old one goes", async ($, on) => {
  const s = world(on);
  await send($, "only one");
  const stale = notesOf(await compact($))[0]!;
  const own: SessionMessage = { role: "user", text: "only one", toolUses: [] };
  s.kept = [SUMMARY, stale, own];
  expect(await compact($)).toEqual([SUMMARY, own]);
});

test("a second compaction replaces the note instead of adding one", async ($, on) => {
  const s = world(on);
  await send($, "first");
  const first = await compact($);
  await send($, "later");
  s.kept = [SUMMARY, notesOf(first)[0]!];
  const notes = notesOf(await compact($, { messages: first }));
  expect(notes.length).toBe(1);
  expect(notes[0]!.text).toContain("later");
});

test("only the five latest messages are kept", async ($, on) => {
  world(on);
  for (let i = 1; i <= 7; i += 1) await send($, `request-${i}`);
  const note = await noteText($);
  expect(note).not.toContain("request-2");
  for (let i = 3; i <= 7; i += 1) expect(note).toContain(`request-${i}`);
});

test("a long message keeps its start and end and says what is left out", async ($, on) => {
  const s = world(on);
  await send($, `START ${"a".repeat(6_000)} AND THE QUESTION?`);
  const note = await noteText($);
  expect(note).toContain("START aaaa");
  expect(note).toContain("AND THE QUESTION?");
  expect(note).toContain("characters not repeated here");
  expect(note.length).toBeLessThan(5_000);
  expect(JSON.stringify(s.store).length).toBeLessThan(5_000);
});

test("a long message core kept is recognised and not repeated", async ($, on) => {
  const s = world(on);
  const long = `START ${"b".repeat(6_000)} END`;
  await send($, long);
  s.kept = [SUMMARY, { role: "user", text: long, toolUses: [] }];
  expect(notesOf(await compact($))).toEqual([]);
});

test("a cut never splits a character", async ($, on) => {
  world(on);
  await send($, `x${"😀".repeat(4_000)}`);
  const note = await noteText($);
  expect(note).toContain("characters not repeated here");
  expect(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      note,
    ),
  ).toBe(false);
});

test("the newest messages win the room there is", async ($, on) => {
  world(on);
  for (const letter of ["c", "d", "e"]) await send($, letter.repeat(3_999));
  const note = await noteText($);
  expect(note).not.toContain("cccc");
  expect(note).toContain("dddd");
  expect(note).toContain("eeee");
});

test("another chat has none and keeps a note it inherited", async ($, on) => {
  const s = world(on);
  await send($, "chat one");
  const inherited = notesOf(await compact($))[0]!;
  s.id = "s2";
  s.kept = [SUMMARY, inherited];
  expect(await compact($)).toEqual([SUMMARY, inherited]);
});

test("an unreadable store blocks neither prompt nor compaction and overwrites nothing", async ($, on) => {
  const s = world(on);
  await send($, "precious");
  const note = notesOf(await compact($))[0]!;
  s.brokenRead = true;
  expect(await send($, "while broken")).toEqual({ text: "while broken" });
  s.kept = [SUMMARY, note];
  expect(await compact($)).toEqual([SUMMARY, note]);
  s.brokenRead = false;
  s.kept = [SUMMARY];
  expect(await noteText($)).toContain("precious");
});

test("a failed write never blocks the prompt", async ($, on) => {
  const s = world(on);
  s.brokenWrite = true;
  expect(await send($, "still goes")).toEqual({ text: "still goes" });
});

test("only the 20 latest chats, none older than 30 days, keep their messages", async ($, on) => {
  const s = world(on);
  for (let i = 1; i <= 25; i += 1)
    s.store[`kit:recent:chat${i}`] = { at: NOW - i * 1_000, messages: [] };
  s.store["kit:recent:ancient"] = { at: NOW - 31 * DAY, messages: [] };
  s.store["kit:pins:other"] = { at: NOW, pins: [] };
  await send($, "new chat");
  const keys = Object.keys(s.store).filter((k) => k.startsWith("kit:recent:"));
  expect(keys.length).toBe(20);
  expect(keys).toContain("kit:recent:s1");
  expect(keys).toContain("kit:recent:chat19");
  expect(keys).not.toContain("kit:recent:chat20");
  expect(keys).not.toContain("kit:recent:ancient");
  expect(Object.keys(s.store)).toContain("kit:pins:other");
});

test("precompute, a skip and a subagent get no recent note", async ($, on) => {
  const s = world(on);
  await send($, "main only");
  expect(notesOf(await compact($, { trigger: "precompute" }))).toEqual([]);
  expect(notesOf(await compact($, { agentId: "child" }))).toEqual([]);
  s.skip = true;
  expect(await compact($)).toEqual([]);
});

test("a restored message never selects a spec", async ($, on) => {
  const s = world(on);
  await send(
    $,
    "see <command-name>/kit:task-readiness</command-name>\n<command-args>login</command-args>",
  );
  const first = await compact($);
  expect(notesOf(first).length).toBe(1);
  await compact($, { messages: first });
  expect(s.reads.filter((p) => p.includes("docs/specs"))).toEqual([]);
});

// The desktop app puts its own blocks around what the user typed.
const HOSTED = [
  "<system-reminder>\nBe careful.\n</system-reminder>\nSTOP, do not deploy",
  '<system-reminder id="a1">\nBe careful.\n</system-reminder id="a1">\nSTOP, do not deploy',
  '<launch-selected-element tag="div">\nBe careful.\n</launch-selected-element>\nSTOP, do not deploy',
  "<artifact-view-context>Be careful.</artifact-view-context>\n<system-reminder>Be careful.</system-reminder>\nSTOP, do not deploy",
  "STOP, do not deploy\n<system-reminder>\nBe careful.\n</system-reminder>",
  '<system-reminder source="x" />\nSTOP, do not deploy',
];

for (const [i, text] of HOSTED.entries())
  test(`host blocks around a prompt are left out, its words kept (${i})`, async ($, on) => {
    world(on);
    await send($, "deploy it");
    await send($, text);
    const note = await noteText($);
    expect(note).toContain("--- message ---\nSTOP, do not deploy");
    expect(note).not.toContain("Be careful");
  });

test("text between two host blocks is not lost with the last one", async ($, on) => {
  world(on);
  await send(
    $,
    "first part\n<system-reminder>one</system-reminder>\nsecond part\n<system-reminder>two</system-reminder>",
  );
  const note = await noteText($);
  expect(note).toContain(
    "first part\n<system-reminder>one</system-reminder>\nsecond part",
  );
  expect(note).not.toContain("two</system-reminder>");
});

test("host events and wrapped command output are not the user's words", async ($, on) => {
  world(on);
  for (const tag of [
    "ci-monitor-event",
    "side-sessions-event",
    "task-notification",
    "agent-message",
    "cross-session-message",
    "local-command-stdout",
    "command-name",
    "bash-input",
  ])
    await send($, `<${tag}>x</${tag}>\nand more`);
  await send($, "<system-reminder>only the host</system-reminder>");
  await send(
    $,
    "<system-reminder>r</system-reminder>\n<ci-monitor-event>red</ci-monitor-event>",
  );
  expect(await compact($)).toEqual([SUMMARY]);
});

test("a pasted element with a hyphen in its name is the user's text", async ($, on) => {
  world(on);
  await send($, "<ion-button> does nothing on press");
  expect(await noteText($)).toContain("<ion-button> does nothing on press");
});

test("a kept message is recognised despite spacing, joined blocks and host blocks", async ($, on) => {
  const s = world(on);
  await send($, "  leading and trailing  ");
  await send($, "block one\nblock two");
  await send($, "with a reminder");
  s.kept = [
    SUMMARY,
    ...[
      "  leading and trailing  ",
      "block oneblock two",
      "<system-reminder>x</system-reminder>with a reminder",
    ].map((text) => ({ role: "user" as const, text, toolUses: [] })),
  ];
  expect(notesOf(await compact($))).toEqual([]);
});

test("another message that only starts the same does not hide a short one", async ($, on) => {
  const s = world(on);
  await send($, "ja");
  s.kept = [
    SUMMARY,
    { role: "user", text: "ja\nmaar eerst iets anders", toolUses: [] },
  ];
  expect(await noteText($)).toContain("--- message ---\nja");
});

test("after a message that could not be saved the note says it may be behind", async ($, on) => {
  const s = world(on);
  await send($, "deploy it");
  expect(await noteText($)).not.toContain("may be behind");
  s.brokenWrite = true;
  await send($, "no, cancel that");
  s.brokenWrite = false;
  const note = await noteText($);
  expect(note).toContain("may be behind");
  expect(note).toContain("deploy it");
  await send($, "later one");
  expect(await noteText($)).toContain("may be behind");
  s.id = "s2";
  await send($, "other chat");
  expect(await noteText($)).not.toContain("may be behind");
});

test("a message in a chat keeps its pins from being pruned", async ($, on) => {
  const s = world(on);
  s.store["kit:pins:s1"] = {
    at: NOW - 31 * DAY,
    pins: [{ text: "x", from: "you" }],
  };
  await send($, "still here");
  expect((s.store["kit:pins:s1"] as { at: number }).at).toBe(NOW);
});

test("tags the user writes about, mid-line, stay in the message", async ($, on) => {
  world(on);
  const written = [
    "what is between <system-reminder> and </system-reminder>?",
    "explain this: <system-reminder>x</system-reminder>",
    "<system-reminder>x</system-reminder> what does this mean",
  ];
  for (const text of written) await send($, text);
  const note = await noteText($);
  for (const text of written)
    expect(note).toContain(`--- message ---\n${text}`);
});

test("the app's annotation block is left out, its other events are not noted", async ($, on) => {
  world(on);
  for (const tag of [
    "teammate-message",
    "pr-created",
    "mcp-resource-update",
    "mcp-polling-update",
    "agent-notification",
  ])
    await send($, `<${tag}>x</${tag}>`);
  await send(
    $,
    "<preview-annotation-context>Be careful.</preview-annotation-context>\nmove this left",
  );
  await send($, "<calendar-event> renders twice");
  const note = await noteText($);
  expect(note).not.toContain("<teammate-message>");
  expect(note).not.toContain("<pr-created>");
  expect(note).not.toContain("<mcp-resource-update>");
  expect(note).not.toContain("<mcp-polling-update>");
  expect(note).not.toContain("<agent-notification>");
  expect(note).not.toContain("Be careful");
  expect(note).toContain("--- message ---\nmove this left");
  expect(note).toContain("<calendar-event> renders twice");
});

test("this chat's messages older than 30 days are not restored or carried on", async ($, on) => {
  const s = world(on);
  s.store["kit:recent:s1"] = {
    at: NOW - 31 * DAY,
    messages: [{ text: "ancient" }],
  };
  expect(await compact($)).toEqual([SUMMARY]);
  await send($, "fresh one");
  const note = await noteText($);
  expect(note).toContain("fresh one");
  expect(note).not.toContain("ancient");
});

test("a run's first message removes old copies, also in a chat that has one", async ($, on) => {
  const s = world(on);
  const old = { at: NOW - 31 * DAY };
  s.store["kit:recent:s1"] = { at: NOW - DAY, messages: [{ text: "mine" }] };
  s.store["kit:recent:gone"] = { ...old, messages: [] };
  s.store["kit:pins:gone"] = { ...old, pins: [] };
  s.store["kit:pins:s1"] = { ...old, pins: [{ text: "x", from: "you" }] };
  await send($, "hello");
  expect(Object.keys(s.store).sort()).toEqual(["kit:pins:s1", "kit:recent:s1"]);
});

test("the warning about a missed save is kept with the next saved message", async ($, on) => {
  const s = world(on);
  s.brokenWrite = true;
  await send($, "lost");
  s.brokenWrite = false;
  await send($, "saved");
  expect((s.store["kit:recent:s1"] as { behind?: boolean }).behind).toBe(true);
  s.id = "s2";
  s.store["kit:recent:s2"] = {
    at: NOW,
    behind: true,
    messages: [{ text: "from before a restart" }],
  };
  expect(await noteText($)).toContain("may be behind");
});
