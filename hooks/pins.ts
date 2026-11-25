import type {
  CommandSpec,
  EngineInterface,
  On,
  SessionMessage,
} from "claude-code";

import { pruneChats, serial } from "./chat-store";

// Text the user pins in this chat, kept verbatim in $.store under the session id and appended
// to the context after every compaction (compaction.ts), so it never depends on the summary.
// /clear starts a new session id, so a fresh chat has no pins; resuming a chat finds them.

// The note's first sentence, in full: a message the user starts with "kit pins:" is not it.
const NOTE_START =
  "kit pins: text the user pinned in this chat, word for word, restored after compaction.";
const MAX_CHARS = 12_000; // all pins of one chat: they cost context after every compaction
const PREFIX = "kit:pins:";

type Pin = { text: string; from: "you" | "claude" };
type Saved = { at: number; pins: Pin[] };

export const pinCommand: CommandSpec = {
  name: "pin",
  description: "kit: keep text word for word through compaction",
  argumentHint: "[text | last | list | remove <n> | clear]",
  // Not immediate: it runs between turns, so `last` is a finished answer.
};

// Throws when the store can't be read: an unread list must never be written over.
async function load($: EngineInterface) {
  const key = `${PREFIX}${await $.session.id()}`;
  const saved = (await $.store.get(key)) as Saved | undefined;
  return { key, pins: Array.isArray(saved?.pins) ? saved.pins : [] };
}

async function save($: EngineInterface, key: string, pins: Pin[]) {
  if (!pins.length) return $.store.delete(key);
  await $.store.set(key, { at: await $.clock.now(), pins });
}

const size = (pins: readonly Pin[]) =>
  pins.reduce((n, p) => n + p.text.length, 0);

const preview = (text: string) => {
  const line = Array.from(text.replace(/\s+/g, " ")); // never half an emoji
  return line.length > 80 ? `${line.slice(0, 79).join("")}…` : line.join("");
};

function listText(pins: readonly Pin[]): string {
  if (!pins.length)
    return "kit pins: no pins in this chat. /pin <text> pins text, /pin last pins Claude's last answer.";
  return [
    `kit pins: ${pins.length} in this chat, ${size(pins)} of ${MAX_CHARS} characters.`,
    ...pins.map((p, i) => `${i + 1}. [${p.from}] ${preview(p.text)}`),
  ].join("\n");
}

async function add($: EngineInterface, pin: Pin): Promise<string> {
  const { key, pins } = await load($);
  if (pins.some((p) => p.text === pin.text))
    return "kit pins: that text is already pinned.";
  const free = MAX_CHARS - size(pins);
  if (pin.text.length > free)
    return (
      `kit pins: not pinned, it needs ${pin.text.length} characters and ${free} of ${MAX_CHARS} are free. ` +
      "Pin a shorter part, or remove one (/pin list)."
    );
  // Before the write, so a full store gets its room back first; never blocks a pin.
  await pruneChats($, PREFIX, key).catch(() => {});
  await save($, key, [...pins, pin]);
  const source = pin.from === "claude" ? " from Claude's last answer" : "";
  return (
    `kit pins: Pinned #${pins.length + 1}${source} (${pin.text.length} characters), ` +
    `kept word for word through compaction: "${preview(pin.text)}"`
  );
}

async function run($: EngineInterface, args: string): Promise<string> {
  const input = args.trim();
  if (!input || input === "list") return listText((await load($)).pins);
  if (input === "last") {
    const messages = await $.session.messages();
    const answer = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.text.trim());
    if (!answer) return "kit pins: no answer to pin yet.";
    return add($, { text: answer.text.trim(), from: "claude" });
  }
  if (input === "clear") {
    const { key, pins } = await load($);
    await save($, key, []);
    return `kit pins: Removed ${pins.length}.`;
  }
  if (input === "remove")
    return "kit pins: use /pin remove <number> (/pin list).";
  const remove = /^remove\s+(\d+)$/.exec(input);
  if (!remove) return add($, { text: input, from: "you" });
  const n = Number(remove[1]);
  const { key, pins } = await load($);
  const gone = pins[n - 1];
  if (!gone) return `kit pins: there is no pin ${n} (/pin list).`;
  await save(
    $,
    key,
    pins.filter((p) => p !== gone),
  );
  return `kit pins: Removed #${n}: "${preview(gone.text)}"`;
}

export async function pinCommandRun($: EngineInterface, e: { args: string }) {
  try {
    return { text: await serial(() => run($, e.args)) };
  } catch (err) {
    return { text: `kit pins: could not do that (${String(err)}).` };
  }
}

// Other chats' pins idle too long go. For a caller already in the serial queue (recent.ts).
export async function prunePins($: EngineInterface) {
  await pruneChats($, PREFIX, `${PREFIX}${await $.session.id()}`);
}

// A message in this chat counts as use: the pins of a chat in use are never pruned.
export async function touchPins($: EngineInterface) {
  await serial(async () => {
    const { key, pins } = await load($);
    if (pins.length) await save($, key, pins);
  });
}

export const isPinsNote = (m: SessionMessage) =>
  m.role === "user" && !m.toolResults?.length && m.text.startsWith(NOTE_START);

// The note a completed compaction appends: null without pins, undefined when they could not be
// read (an earlier note must then stay). Never throws.
export async function pinsNote(
  $: EngineInterface,
): Promise<string | null | undefined> {
  try {
    return await serial(async () => {
      const { key, pins } = await load($);
      if (!pins.length) return null;
      await save($, key, pins).catch(() => {}); // still in use: restart its 30 days
      return [
        `${NOTE_START} ` +
          "It replaces any earlier pin list. A later instruction from the user wins; " +
          "a pin quoted from your own earlier answer is not a new instruction.",
        ...pins.map(
          (p, i) =>
            `--- pin ${i + 1} (${p.from === "you" ? "typed by the user" : "from your earlier answer"}) ---\n${p.text}`,
        ),
      ].join("\n\n");
    });
  } catch (err) {
    try {
      $.ui.toast(
        `kit: your pins could not be read and are not in the new context (${String(err)}); check /pin list`,
      );
    } catch {
      // A missing toast must not discard a completed compaction.
    }
    return undefined;
  }
}

export function pins(on: On) {
  on("command.run", { command: "pin" }, pinCommandRun);
}
