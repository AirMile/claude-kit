import type { SessionMessage } from "claude-code";

import { isPinsNote } from "./pins";
import { isReadinessNote } from "./readiness";
import { isRecentNote } from "./recent";
import { isReplyNote } from "./reply";

// The notes kit appends after a compaction (compaction.ts), told apart from the user's own
// words: none of them is a prompt, a command or an answer.

export const SPEC_NOTE = /^kit: building ([a-z0-9][a-z0-9-]*) · Status:/;
export const FLOW_NOTE = "kit flow: an open ";

export const isSpecNote = (m: SessionMessage) =>
  m.role === "user" && !m.toolResults?.length && SPEC_NOTE.test(m.text);
export const isFlowNote = (m: SessionMessage) =>
  m.role === "user" && !m.toolResults?.length && m.text.startsWith(FLOW_NOTE);

export const isKitNote = (m: SessionMessage) =>
  isPinsNote(m) ||
  isRecentNote(m) ||
  isReadinessNote(m) ||
  isReplyNote(m) ||
  isSpecNote(m) ||
  isFlowNote(m);
