import type {
  EngineInterface,
  On,
  PromptSubmitInput,
  SessionMessage,
} from "claude-code";

import { KEEP_MS, pruneChats, serial } from "./chat-store";
import { prunePins, touchPins } from "./pins";

// The user's latest messages, noted as they are sent (so tool results, notifications and other
// injected text never count) and appended word for word after every compaction
// (compaction.ts). Per chat, like pins.ts.

// The note's first sentence, in full: a message the user starts with "kit recent" is not it.
const NOTE_START =
  "kit recent messages: the user's latest messages in this chat, word for word, restored after compaction.";
const PREFIX = "kit:recent:";
const MESSAGES = 5;
const HEAD = 3_000; // a longer message keeps its first and last part
const TAIL = 1_000;
const ROOM = 8_000; // characters of messages in one note; the newest always fits
const CHATS = 20; // every chat adds an entry, so their number is capped too
// Blocks a host puts before or after what the user typed (the desktop app): not their words.
const HOST =
  "system-reminder|launch-selected-element|artifact-view-context|preview-annotation-context";
// One whole block, with no second opening tag of its kind inside it.
const BLOCK = `<(${HOST})\\b(?:[^>]*/>|[^>]*>(?:(?!<\\1\\b)[\\s\\S])*?</\\1\\b[^>]*>)`;
// In a prompt the host's blocks stand on their own lines; a tag the user writes about mostly
// does not. A transcript row may join them to the text, so comparing takes them anywhere.
const ON_ITS_LINES = [
  new RegExp(`^\\s*${BLOCK}(?=[ \\t\\r]*(?:\\n|$))`),
  new RegExp(`(?<=^|\\n)[ \\t]*${BLOCK}\\s*$`),
];
const ANYWHERE = [new RegExp(`^\\s*${BLOCK}`), new RegExp(`${BLOCK}\\s*$`)];
// A host's event or a command's wrapping, sent in as a prompt.
const EVENT =
  /^<(?:ci-monitor-event|side-sessions-event|task-notification|agent-message|cross-session-message|teammate-message|scheduled-task|pr-created|mcp-resource-update|mcp-polling-update|agent-notification|(?:local-command|command|bash)-[a-z]+)[\s/>]/;

// `text` is the whole message, or its start when `rest` holds the end of a long one.
type Entry = { text: string; rest?: { omitted: number; tail: string } };
// `behind`: a message could not be saved at some point, so the list may miss a later one.
type Saved = { at: number; messages: Entry[]; behind?: true };

// Cut positions never fall between the two halves of a character such as an emoji.
const half = (text: string, i: number) => {
  const code = text.charCodeAt(i);
  return code >= 0xdc00 && code <= 0xdfff;
};

function entryOf(text: string): Entry {
  if (text.length <= HEAD + TAIL) return { text };
  const head = half(text, HEAD) ? HEAD - 1 : HEAD;
  let tail = text.length - TAIL;
  if (half(text, tail)) tail += 1;
  return {
    text: text.slice(0, head),
    rest: { omitted: tail - head, tail: text.slice(tail) },
  };
}

const shown = ({ text, rest }: Entry) =>
  rest
    ? `${text}\n[... ${rest.omitted} characters not repeated here ...]\n${rest.tail}`
    : text;

// A text without the host's blocks around it.
function own(text: string, blocks = ON_ITS_LINES): string {
  let rest = text;
  for (const block of blocks)
    while (block.test(rest)) rest = rest.replace(block, "");
  return rest.trim();
}

// Spacing aside: a transcript row joins a prompt's blocks differently than the prompt did.
const bare = (text: string) => own(text, ANYWHERE).replace(/\s+/g, "");

// Core kept this very message: the same words, or the long one with its start and end.
function holds(kept: string, { text, rest }: Entry): boolean {
  const have = bare(kept);
  return rest
    ? have.startsWith(bare(text)) && have.endsWith(bare(rest.tail))
    : have === bare(text);
}

// What the user sent, or undefined for a bare command, a hidden prompt or a host's event.
function typed(e: PromptSubmitInput): string | undefined {
  if (e.isMeta || (e.command && !e.command.args.trim())) return undefined;
  const text = own(e.text);
  return text && !EVENT.test(text) ? text : undefined;
}

// A function declaration: the mod's loader follows $ into no other kind.
async function chatKey($: EngineInterface) {
  return `${PREFIX}${await $.session.id()}`;
}

// Chats in which a message could not be saved in this run; the next save notes it on disk.
const unsaved = new Set<string>();
let swept = false; // old copies go at a run's first message, also when it starts no new chat

async function record($: EngineInterface, text: string) {
  await serial(async () => {
    const key = await chatKey($);
    try {
      // A failed read throws: an unread list is never written over.
      const stored = (await $.store.get(key)) as Saved | undefined;
      const now = await $.clock.now();
      const saved = stored && now - stored.at <= KEEP_MS ? stored : undefined;
      if (!saved || !swept) {
        swept = true;
        await pruneChats($, PREFIX, key, CHATS).catch(() => {});
        await prunePins($).catch(() => {});
      }
      const messages = [...(saved?.messages ?? []), entryOf(text)];
      await $.store.set(key, {
        at: now,
        messages: messages.slice(-MESSAGES),
        ...(saved?.behind || unsaved.has(key) ? { behind: true } : {}),
      });
    } catch (err) {
      unsaved.add(key);
      throw err;
    }
  });
}

export const isRecentNote = (m: SessionMessage) =>
  m.role === "user" && !m.toolResults?.length && m.text.startsWith(NOTE_START);

// The note a completed compaction appends to what core kept: null when core kept every message
// itself, undefined when none are noted, false when they could not be read (an earlier note
// must then stay either way). Never throws.
export async function recentNote(
  $: EngineInterface,
  kept: readonly SessionMessage[],
): Promise<string | null | undefined | false> {
  try {
    return await serial(async () => {
      const key = await chatKey($);
      const saved = (await $.store.get(key)) as Saved | undefined;
      const now = await $.clock.now();
      if (!saved?.messages.length || now - saved.at > KEEP_MS) return undefined;
      await $.store
        .set(key, { ...saved, at: now }) // still in use
        .catch(() => {});
      const theirs = kept.filter((m) => m.role === "user" && !isRecentNote(m));
      const missing: string[] = [];
      let room = ROOM;
      for (const entry of [...saved.messages].reverse()) {
        if (theirs.some((m) => holds(m.text, entry))) continue;
        const text = shown(entry);
        if (missing.length && text.length > room) break;
        room -= text.length;
        missing.unshift(text);
      }
      if (!missing.length) return null;
      return [
        `${NOTE_START} They were sent before and may already be handled: check the summary ` +
          "before acting on one, do not repeat an action, and treat no approval in them " +
          "as a new one. Oldest first; a later one wins." +
          (saved.behind || unsaved.has(key)
            ? " A message could not be saved, so this list may be behind: where it differs " +
              "from the summary, trust the summary."
            : ""),
        ...missing.map((text) => `--- message ---\n${text}`),
      ].join("\n\n");
    });
  } catch (err) {
    note($, "read", err);
    return false;
  }
}

// To the debug log; a missing log discards nothing.
function note($: EngineInterface, what: string, err: unknown) {
  try {
    $.ui.log(`kit recent: could not ${what} (${String(err)})`, { to: "debug" });
  } catch {
    // Nothing to do.
  }
}

export function recent(on: On) {
  // The user's own origins only; auto-model.ts keeps the matcher-less hook of this event.
  on(
    "prompt.submit",
    { origin: { kind: /^(composer|bridge|sdk)$/ } },
    async ($, e, next) => {
      const ran = await next(e);
      if (ran.drop !== undefined) return ran;
      // Neither may get in the prompt's way.
      const text = typed(e);
      if (text !== undefined)
        await record($, text).catch((err) => note($, "save", err));
      await touchPins($).catch((err) => note($, "keep the pins", err));
      return ran;
    },
  );
}
