import type { SessionMessage } from "claude-code";

// The open task's readiness block (task-readiness's Output: Goal … Open), pure. Flow keeps the
// newest block written in a turn of the open task on the task itself (flow.ts, at the turn's
// end and before a compaction), and compaction.ts puts it back word for word after the summary,
// so the goal, checks and approval points survive any summary. A new task starts without one.

const NOTE = (task: number) =>
  `kit readiness (task ${task}): the open task's readiness block, word for word, restored after compaction.`;
const NOTE_RE = /^kit readiness \(task (\d+)\): /;
// From a line that starts with "Goal:" to the first line after it that starts with "Open:",
// with no other Goal line between; a label may be bold (**Goal:**).
const BLOCK =
  /^[ \t]*(?:\*\*)?Goal:(?:\*\*)?[^\n]*(?:\n(?![ \t]*(?:\*\*)?Goal:)[^\n]*){0,40}?\n[ \t]*(?:\*\*)?Open:(?:\*\*)?[^\n]*/gm;
const MAX = 4_000; // a block is about ten lines: a longer match is not one, and is never cut

export const isReadinessNote = (m: SessionMessage) =>
  m.role === "user" && !m.toolResults?.length && NOTE_RE.test(m.text);

// The last block in the text: a corrected block written after the first one wins.
export function readinessBlock(text: string): string | undefined {
  let found: string | undefined;
  for (const m of text.matchAll(BLOCK)) if (m[0].length <= MAX) found = m[0];
  return found;
}

// The newest block the assistant wrote since the user's last own message (a prompt, not a
// tool result or one of kit's notes, which `isNote` names): the running or just ended turn's.
export function turnBlock(
  messages: readonly SessionMessage[],
  isNote: (m: SessionMessage) => boolean,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role === "user") {
      if (m.toolResults?.length || isNote(m)) continue;
      return undefined;
    }
    const block = readinessBlock(m.text);
    if (block) return block;
  }
  return undefined;
}

export const readinessNote = (task: number, block: string) =>
  `${NOTE(task)}\n${block}`;
