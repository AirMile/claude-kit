import type { CommandSpec, EngineInterface, On } from "claude-code";

import {
  isProtected,
  parseProtected,
  refusal,
  clean,
  relativeTo,
  shellWritesProtected,
} from "./guard-policy";
import { inRoot } from "./spec";

// The checker guard: while the user has locked a project (/guard on), the files its AGENTS.md
// lists as `Protected:` cannot be edited, by this chat or its subagents. The lock lives in
// $.store, which the agent cannot write, and is per project root. guard-policy.ts says what
// matches; a shell check is a speed bump, not a sandbox.

const KEY = "kit:guard";

export const guardCommand: CommandSpec = {
  name: "guard",
  description:
    "kit: lock the files that define green (AGENTS.md § Commands, Protected:) against edits",
  argumentHint: "[on | off | status]",
  immediate: true,
};

async function root($: EngineInterface): Promise<string | undefined> {
  return $.session.root().catch(() => undefined);
}

async function globs($: EngineInterface, dir: string): Promise<string[]> {
  const text = await $.fs.read(inRoot(dir, "AGENTS.md")).catch(() => "");
  return parseProtected(String(text));
}

// Per project root, with the globs as they were when the user locked it: a later edit of
// AGENTS.md cannot loosen them.
type Locks = Record<string, string[]>;
const key = (dir: string) => clean(dir).replace(/\/$/, "").toLowerCase();

async function locks($: EngineInterface): Promise<Locks> {
  const stored = await $.store.get(KEY).catch(() => undefined);
  return stored && typeof stored === "object" ? (stored as Locks) : {};
}

// The lock of this folder or of the project it is a worktree of (below the locked root).
async function lockOf(
  $: EngineInterface,
  dir: string,
): Promise<string[] | undefined> {
  const k = key(dir);
  const all = await locks($);
  const hit = Object.keys(all).find((r) => k === r || k.startsWith(`${r}/`));
  return hit ? all[hit] : undefined;
}

async function setLock(
  $: EngineInterface,
  dir: string,
  globs: string[] | undefined,
) {
  const all = { ...(await locks($)) };
  if (globs) all[key(dir)] = globs;
  else {
    // Unlocking from a worktree below a locked root lifts that root's lock.
    const k = key(dir);
    for (const r of Object.keys(all))
      if (k === r || k.startsWith(`${r}/`)) delete all[r];
  }
  await $.store.set(KEY, all).catch(() => {});
}

export async function guardCommandRun($: EngineInterface, e: { args: string }) {
  const dir = await root($);
  if (!dir) return { text: "kit guard: no project folder here." };
  const verb = e.args.trim().toLowerCase() || "status";
  const list = await globs($, dir);
  if (verb === "on") {
    if (!list.length)
      return {
        text: "kit guard: nothing to lock. Add a line `- Protected: <globs>` under `## Commands` in AGENTS.md (the lint, type and test config, CI files, test helpers), then /guard on.",
      };
    await setLock($, dir, list);
    return {
      text: `kit guard: locked: ${list.join(", ")}. /guard off unlocks.`,
    };
  }
  if (verb === "off") {
    await setLock($, dir, undefined);
    return { text: "kit guard: unlocked." };
  }
  const held = await lockOf($, dir);
  return {
    text: held
      ? `kit guard: locked: ${held.join(", ")}`
      : `kit guard: unlocked · ${list.length ? list.join(", ") : "no Protected: globs in AGENTS.md"}`,
  };
}

export function guard(on: On) {
  on(
    "tool.call",
    {
      tool: [
        "Edit",
        "Write",
        "MultiEdit",
        "NotebookEdit",
        "Bash",
        "PowerShell",
      ],
    },
    async ($, e, next) => {
      const dir = await root($);
      const list = dir ? await lockOf($, dir) : undefined;
      if (!dir || !list?.length) return next(e);
      const input = e as {
        file_path?: string;
        notebook_path?: string;
        command?: string;
      };
      const file = input.file_path ?? input.notebook_path;
      if (file !== undefined) {
        const rel = relativeTo(dir, file);
        return isProtected(rel, list) ? { deny: refusal(rel) } : next(e);
      }
      return input.command !== undefined &&
        shellWritesProtected(input.command, list)
        ? { deny: refusal("a file this command writes") }
        : next(e);
    },
  );
  on("command.run", { command: "guard" }, guardCommandRun);
}
