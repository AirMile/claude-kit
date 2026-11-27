import type { EngineInterface } from "claude-code";

import { checkOf, hashText, type CheckKind } from "./flow-check";
import type { Task } from "./flow-policy";
import { state } from "./flow-state";
import { inRoot } from "./spec";

// Which checks a task must have seen pass, and which failures were there before it began, pure
// except `ensureRequired`. The project's own commands (`AGENTS.md § Commands`) say which kinds it
// has; a lint pass is no evidence for tests that never ran, and a suite that was already red
// before the first edit must not hold the task forever.

const HEADING = /^##\s+Commands\b/i;
const LINE =
  /^\s*(?:[-*]\s*)?(Test|Lint(?:\s*\/\s*typecheck)?|Typecheck|Build)\s*:\s*(.*)$/i;
const NONE = /^(?:—|–|-|none|n\/a|geen)?$/i;

// The kinds `## Commands` lists: Test → test, Lint (/ typecheck) → static, Build → build. A value
// of `—`, `-` or none means the project has no such command.
export function parseRequired(agentsMd: string): CheckKind[] {
  const found: CheckKind[] = [];
  let inside = false;
  for (const line of agentsMd.split(/\r?\n/)) {
    if (/^##\s/.test(line)) inside = HEADING.test(line);
    if (!inside) continue;
    const m = LINE.exec(line);
    const name = m?.[1]?.toLowerCase();
    if (!name) continue;
    const value = m?.[2] ?? "";
    if (NONE.test(value.replace(/`/g, "").trim())) continue;
    const kind: CheckKind =
      name.startsWith("lint") || name === "typecheck"
        ? "static"
        : name === "test"
          ? "test"
          : "build";
    // Only a command flow can recognise as a check can ever be seen passing: another one
    // (./scripts/test.sh) would hold the task for ever.
    const command = /`([^`]+)`/.exec(value)?.[1] ?? value.trim();
    if (!checkOf(command)?.kinds.includes(kind)) continue;
    if (!found.includes(kind)) found.push(kind);
  }
  return found;
}

// A required kind with no passing run on the latest code. Light tasks need one passing check
// (flow-evidence's `checked`), not every kind. A baseline-red kind still has to run on the latest
// code: its unchanged failure counts as that run (flow-kinds.ts), so it needs no pass.
export function requiredMissing(
  t: Task,
  print: string | undefined,
): CheckKind[] {
  if (t.track === "light") return [];
  const byGit = print !== undefined && t.basePrint !== undefined;
  return (t.required ?? []).filter((k) =>
    byGit
      ? t.passedPrints?.[k] !== print
      : (t.passedAt?.[k] ?? 0) <= t.lastEditAt,
  );
}

const ANSI = /\x1b\[[0-9;]*m/g;
const TIMING = /\(?\d+(?:\.\d+)?\s?(?:ms|s|%)\)?/g;
const PASSED = /\b\d+ (?:passed|passing)\b,?/g;
const FAILING =
  /\bFAIL\b|\bFAILED\b|✗|✖|✕|●|\bError\b|\berror TS\d+|\b[1-9]\d* (?:failed|failing|errors?)\b/;

// What a red run says, without what changes between runs: the failing lines, minus timings and
// the number of passes, sorted. undefined when the output names no failing line, so an
// unrecognised failure is never mistaken for a known one.
export function failureHash(output: string): string | undefined {
  const lines = output
    .replace(ANSI, "")
    .split(/\r?\n/)
    .map((line) =>
      line.replace(TIMING, "").replace(PASSED, "").replace(/\s+/g, " ").trim(),
    )
    .filter((line) => FAILING.test(line));
  return lines.length
    ? hashText([...new Set(lines)].sort().join("\n"))
    : undefined;
}

// The task has not touched code yet: a failing check now was already failing.
export const pristine = (t: Task, print: string | undefined): boolean =>
  t.basePrint !== undefined && print !== undefined
    ? print === t.basePrint
    : t.lastEditAt === 0;

// Reads the project's commands once per task, when a task is open and has none read yet.
export async function ensureRequired($: EngineInterface) {
  const task = state.task;
  if (!task || task.required !== undefined) return;
  const session = await $.session.root().catch(() => undefined);
  // A task with code in another repo (flow.ts's `away`) is held to that repo's commands too: it
  // may have changed code in both.
  const roots = [session, task.away].filter((r): r is string => !!r);
  const required = new Set<CheckKind>();
  for (const root of roots) {
    const text = String(
      await $.fs.read(inRoot(root, "AGENTS.md")).catch(() => ""),
    );
    for (const kind of parseRequired(text)) required.add(kind);
  }
  if (state.task === task)
    state.task = {
      ...task,
      required: [...required],
      requiredRoot: task.away ?? session,
    };
}
