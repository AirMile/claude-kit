import type { EngineInterface } from "claude-code";

import { DOCS_PATHSPEC, hashText } from "./flow-check";
import { keep, type LogEntry } from "./flow-log";
import type { Task } from "./flow-policy";

// What flow keeps (flow.ts): the open task per session (the newest 20 sessions) and the log
// in $.store, and the worktree's git fingerprint it judges changes by.

const LOG_KEY = "flowLog";
const TASKS_KEY = "flowTasks";
const MAX_SESSIONS = 20;

export async function readLog($: EngineInterface): Promise<LogEntry[]> {
  const stored = await $.store.get(LOG_KEY).catch(() => undefined);
  return Array.isArray(stored) ? (stored as LogEntry[]) : [];
}

export async function writeLog($: EngineInterface, list: LogEntry[]) {
  await $.store.set(LOG_KEY, list).catch(() => {});
}

export async function log(
  $: EngineInterface,
  entry: Omit<LogEntry, "at"> & { at?: number },
) {
  const full = { ...entry, at: entry.at ?? (await $.clock.now()) };
  try {
    $.ui.log(`kit flow: ${JSON.stringify(full)}`, { to: "debug" });
  } catch {
    // no debug log here: the store keeps it
  }
  await writeLog($, keep(await readLog($), full));
}

export async function loadTask(
  $: EngineInterface,
  session: string,
): Promise<Task | undefined> {
  const all = await $.store.get(TASKS_KEY).catch(() => undefined);
  return all && typeof all === "object"
    ? ((all as Record<string, Task>)[session] ?? undefined)
    : undefined;
}

export async function saveTask(
  $: EngineInterface,
  session: string,
  task: Task | undefined,
) {
  const stored = await $.store.get(TASKS_KEY).catch(() => undefined);
  const all = {
    ...(stored && typeof stored === "object"
      ? (stored as Record<string, Task>)
      : {}),
  };
  delete all[session];
  if (task) all[session] = task;
  const recent = Object.fromEntries(Object.entries(all).slice(-MAX_SESSIONS));
  await $.store.set(TASKS_KEY, recent).catch(() => {});
}

// The worktree's fingerprint: tracked changes, the status and untracked files' contents, docs
// left out. Undefined outside git (or before a first commit): flow then goes by the tool calls.
export async function worktreePrint($: EngineInterface): Promise<string | undefined> {
  const root = await $.session.root().catch(() => undefined);
  if (!root) return undefined;
  const git = (args: string[], stdin?: string) =>
    $.process
      .run(["git", ...args], { cwd: root, stdin, timeoutMs: 10_000 })
      .catch(() => null);
  const diff = await git(["diff", "HEAD", "--no-ext-diff", "--", ".", ...DOCS_PATHSPEC]);
  if (!diff || diff.exitCode !== 0) return undefined;
  const status = await git(["status", "--porcelain", "-uall", "--", ".", ...DOCS_PATHSPEC]);
  if (!status || status.exitCode !== 0) return undefined;
  const untracked = status.stdout
    .split("\n")
    .filter((l) => l.startsWith("?? "))
    .map((l) => l.slice(3));
  const blobs = untracked.length
    ? await git(["hash-object", "--stdin-paths"], untracked.join("\n"))
    : null;
  return hashText(`${diff.stdout}\0${status.stdout}\0${blobs?.stdout ?? ""}`);
}
