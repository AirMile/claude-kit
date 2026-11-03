import type { EngineInterface } from "claude-code";

import type { Task } from "./flow-policy";
import { loadTask, saveTask } from "./flow-store";

// Shared by the turn and agent glue: one session's task in memory, backed by $.store.
export const state: { task?: Task; loadedFor?: string } = {};

export async function load($: EngineInterface) {
  const id = await $.session.id().catch(() => "");
  if (state.loadedFor === id) return;
  state.loadedFor = id;
  state.task = await loadTask($, id);
}

export async function save($: EngineInterface) {
  await saveTask(
    $,
    state.loadedFor ?? (await $.session.id().catch(() => "")),
    state.task,
  );
}
