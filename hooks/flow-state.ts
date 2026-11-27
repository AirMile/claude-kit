import type { EngineInterface } from "claude-code";

import { reopen } from "./flow-evidence";
import { maxTrack, sizeTrack, type Task } from "./flow-policy";
import { loadTask, saveTask } from "./flow-store";

// Shared by the turn and agent glue: one session's task in memory, backed by $.store.
// `unreadFor`: the session whose stored task could not be read yet; until it is, the task in
// memory holds what this session did meanwhile; `block`, a readiness block a turn wrote then
// with no task in memory, goes on the stored task once it is read.
export const state: {
  task?: Task;
  loadedFor?: string;
  unreadFor?: string;
  block?: { for: string; text: string };
} = {};

// true once the session's stored task is known.
export async function load($: EngineInterface): Promise<boolean> {
  const id = await $.session.id().catch(() => "");
  if (state.loadedFor === id) return true;
  let stored: Task | undefined;
  try {
    stored = await loadTask($, id);
  } catch {
    if (state.unreadFor !== id) {
      state.task = undefined; // another session's task is not this one's
      state.block = undefined;
    }
    state.unreadFor = id;
    state.loadedFor = undefined;
    return false; // the next flow event tries again
  }
  const meanwhile = state.unreadFor === id ? state.task : undefined;
  state.loadedFor = id;
  state.unreadFor = undefined;
  state.task = joined(stored, meanwhile);
  // Only this session's, and only when no later turn wrote one on the task in memory.
  if (state.block?.for === id && stored && state.task && !meanwhile?.readiness)
    state.task = { ...state.task, readiness: state.block.text };
  state.block = undefined;
  return true;
}

const TRACKS: Task["track"][] = ["light", "medium", "heavy"];

// The stored task goes on; edits made while it could not be read join it, so the gate still
// sees them.
function joined(stored?: Task, meanwhile?: Task): Task | undefined {
  if (!stored || !meanwhile) return stored ?? meanwhile;
  // An edit since reopens what passed before it, as flow-policy's onEdit does.
  const base =
    meanwhile.lastEditAt > stored.lastEditAt
      ? reopen(stored, meanwhile.lastEditAt)
      : stored;
  const files = [...new Set([...stored.files, ...meanwhile.files])];
  // Both halves may be light while all their files together are not. Growth past the stored
  // track raises the stored task's Verify level, as an edit's growth does (flow.ts).
  const grown = maxTrack(
    maxTrack(base.track, meanwhile.track),
    sizeTrack({ ...base, files }),
  );
  const gateV = Math.max(base.gateV ?? 0, meanwhile.gateV ?? 0) || undefined;
  // One step per track passed, as each growth note raises it once (on the safe side when one
  // edit jumps two).
  const steps = TRACKS.indexOf(grown) - TRACKS.indexOf(base.track);
  const raised =
    steps > 0 && base.levels
      ? Math.min(3, (base.gateV ?? base.levels.v) + steps)
      : 0;
  return {
    ...base,
    files,
    lastEditAt: Math.max(stored.lastEditAt, meanwhile.lastEditAt),
    readiness: meanwhile.readiness ?? stored.readiness,
    // Who wrote and how big it got may only grow: a review must still see every writer.
    track: grown,
    gateV: (Math.max(gateV ?? 0, raised) || undefined) as Task["gateV"],
    spec: base.spec || meanwhile.spec,
    gptWrote: base.gptWrote || meanwhile.gptWrote || undefined,
    geminiWrote: base.geminiWrote || meanwhile.geminiWrote || undefined,
    claudeWrote: base.claudeWrote || meanwhile.claudeWrote || undefined,
  };
}

// Nothing is written while the stored task is unread: the task in memory may be only part of
// it, and would replace it.
export async function save($: EngineInterface) {
  if (state.loadedFor === undefined) return;
  await saveTask($, state.loadedFor, state.task);
}
