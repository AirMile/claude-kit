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

// The worktree's fingerprint: each code file's content (git's blob id, never written), docs
// left out. It names the content, not the change from HEAD, so a commit leaves it as it was.
// Undefined outside git: flow then goes by the tool calls.
export async function worktreePrint(
  $: EngineInterface,
): Promise<string | undefined> {
  const root = await $.session.root().catch(() => undefined);
  if (!root) return undefined;
  const git = (args: string[], stdin?: string) =>
    $.process
      .run(["git", ...args], { cwd: root, stdin, timeoutMs: 10_000 })
      .catch(() => null);
  const scope = ["--", ".", ...DOCS_PATHSPEC];
  const index = await git(["ls-files", "-s", ...scope]);
  if (!index || index.exitCode !== 0) return undefined;
  const edited = await git([
    "diff",
    "--name-status",
    "--no-renames",
    "--no-ext-diff",
    ...scope,
  ]);
  const fresh = await git([
    "ls-files",
    "--others",
    "--exclude-standard",
    ...scope,
  ]);
  if (!edited || edited.exitCode !== 0 || !fresh || fresh.exitCode !== 0)
    return undefined;
  // The index's blob per path, then what the worktree holds where it differs.
  const blobs = new Map<string, string>();
  for (const line of index.stdout.split("\n")) {
    const [meta, path] = line.split("\t");
    if (path) blobs.set(path, meta?.split(" ")[1] ?? "");
  }
  const reread: string[] = [];
  for (const line of edited.stdout.split("\n")) {
    const [state, path] = line.split("\t");
    if (!path) continue;
    if (state === "D") blobs.delete(path);
    else reread.push(path);
  }
  reread.push(...fresh.stdout.split("\n").filter(Boolean));
  if (reread.length) {
    const hashed = await git(
      ["hash-object", "--stdin-paths"],
      reread.join("\n"),
    );
    if (!hashed || hashed.exitCode !== 0) return undefined;
    const ids = hashed.stdout.split("\n");
    reread.forEach((path, i) => blobs.set(path, ids[i] ?? ""));
  }
  const listing = [...blobs].sort(([x], [y]) => (x < y ? -1 : 1));
  return hashText(listing.map(([path, blob]) => `${path}\0${blob}`).join("\n"));
}
