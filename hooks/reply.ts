import type { SessionMessage } from "claude-code";

// The assistant's last reply, pure: put back word for word after every main-chat compaction
// (compaction.ts), so a question or plan the user answers next is the one they read, not the
// summary's paraphrase. A user-role note, never the engine's message itself: a kept assistant
// message would need its tool calls and their results around it.

const NOTE_START =
  "kit last reply: your last reply before compaction, word for word, restored after it.";
const ANSWERED =
  "The user has written since; their messages come after it in time.";
const HOW = "Do not repeat it; act on it only as the user's latest message says.";
const CUT = " characters not repeated here ...]";
const HEAD = 3_000; // a longer reply keeps its first and last part, like recent.ts
const TAIL = 1_000;

export const isReplyNote = (m: SessionMessage) =>
  m.role === "user" && !m.toolResults?.length && m.text.startsWith(NOTE_START);

const half = (text: string, i: number) => {
  const code = text.charCodeAt(i);
  return code >= 0xdc00 && code <= 0xdfff;
};

function cut(text: string): { text: string; cut: boolean } {
  if (text.length <= HEAD + TAIL) return { text, cut: false };
  const head = half(text, HEAD) ? HEAD - 1 : HEAD;
  let tail = text.length - TAIL;
  if (half(text, tail)) tail += 1;
  return {
    text:
      `${text.slice(0, head)}\n[... ${tail - head} characters not repeated here ...]\n` +
      text.slice(tail),
    cut: true,
  };
}

// The questions an AskUserQuestion call put to the user, and the answer once the transcript
// holds it: neither is in the reply's text.
function asked(m: SessionMessage): { text: string; answered: boolean } {
  const lines: string[] = [];
  let answered = false;
  for (const use of m.toolUses) {
    if (use.tool !== "AskUserQuestion") continue;
    const qs = (use.input as { questions?: unknown }).questions;
    if (!Array.isArray(qs)) continue;
    // A refused or failed card has result text too, but no answer.
    const answer =
      !use.isError && typeof use.text === "string" ? use.text.trim() : "";
    for (const q of qs as { question?: unknown; options?: unknown }[]) {
      if (typeof q?.question !== "string") continue;
      const options = Array.isArray(q.options)
        ? (q.options as { label?: unknown }[])
            .map((o) => o?.label)
            .filter((l): l is string => typeof l === "string")
        : [];
      lines.push(
        `Asked: ${q.question}${options.length ? ` (options: ${options.join(" / ")})` : ""}`,
      );
    }
    if (answer) {
      lines.push(`The user's answer: ${answer}`);
      answered = true;
    }
  }
  return { text: lines.join("\n"), answered };
}

export type Reply = { text: string; cut: boolean };

// The note for what the chat held before the summary (`before`), given what core kept
// (`kept`): null when core kept the reply itself or there is none, else the note. A reply note
// an earlier compaction left is carried over when no newer reply came since. `isNote` names
// kit's other notes, which are not the user's words.
export function replyNote(
  before: readonly SessionMessage[],
  kept: readonly SessionMessage[],
  isNote: (m: SessionMessage) => boolean,
): Reply | null {
  let toolsAfter = false; // tool calls came after it: written in the turn still running
  let answered = false; // the user wrote after it
  const note = (body: string, cut: boolean): Reply => {
    const when = answered
      ? ANSWERED
      : toolsAfter
        ? "Written in the turn that was still running; tool calls came after it."
        : "It ended your last turn: the user's next message answers it.";
    return {
      text: `${NOTE_START} ${when} ${HOW}\n\n${body}`,
      cut,
    };
  };
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const m = before[i]!;
    if (m.role === "user") {
      // An earlier compaction's note, kept by core or not: it goes again, last, its label
      // brought up to date (the user may have answered since).
      if (isReplyNote(m)) {
        // Nothing came since: the note goes again as it was, its label included.
        if (!answered && !toolsAfter) return { text: m.text, cut: m.text.includes(CUT) };
        // Once answered, always answered: the answer may be summarized away since.
        answered ||= m.text.slice(0, m.text.indexOf("\n\n")).includes(ANSWERED);
        const body = m.text.slice(m.text.indexOf("\n\n") + 2);
        return note(body, body.includes(CUT));
      }
      if (m.toolResults?.length) toolsAfter = true;
      else if (!isNote(m)) answered = true;
      continue;
    }
    const card = asked(m);
    answered ||= card.answered; // a question card the user answered
    const said = [m.text.trim(), card.text].filter(Boolean).join("\n\n");
    if (!said) {
      toolsAfter = true;
      continue;
    }
    // Core kept the message itself (the engine's handle says so; text only without one).
    if (
      kept.some(
        (k) =>
          k.role === "assistant" &&
          (m.handle !== undefined ? k.handle === m.handle : k.text === m.text),
      )
    )
      return null;
    const body = cut(said);
    return note(body.text, body.cut);
  }
  return null;
}
