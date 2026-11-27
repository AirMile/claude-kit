import type { CommandSpec, EngineInterface, On } from "claude-code";

import { commitBlock, isCommit } from "./commit-gate-policy";
import { load, settled, state, taskPrint } from "./flow-state";
import { clean } from "./guard-policy";

// The commit gate (commit-gate-policy.ts says when): a `git commit` in the Bash tool is denied
// while the open medium or heavy task is unverified. On by default; /commitgate off turns it
// off for this project, kept in $.store per project root.

const KEY = "kit:commitgate";

export const commitGateCommand: CommandSpec = {
  name: "commitgate",
  description:
    "kit: hold git commit while the open task is unverified (on by default)",
  argumentHint: "[on | off | status]",
  immediate: true,
};

const key = (dir: string) => clean(dir).replace(/\/$/, "").toLowerCase();

async function offFor($: EngineInterface, dir: string): Promise<boolean> {
  const stored = await $.store.get(KEY).catch(() => undefined);
  const off =
    stored && typeof stored === "object"
      ? (stored as Record<string, boolean>)
      : {};
  const k = key(dir);
  return Object.keys(off).some(
    (r) => off[r] && (k === r || k.startsWith(`${r}/`)),
  );
}

export async function commitGateCommandRun(
  $: EngineInterface,
  e: { args: string },
) {
  const dir = await $.session.root().catch(() => undefined);
  if (!dir) return { text: "kit commit gate: no project folder here." };
  const verb = e.args.trim().toLowerCase() || "status";
  const stored = await $.store.get(KEY).catch(() => undefined);
  const all = {
    ...(stored && typeof stored === "object"
      ? (stored as Record<string, boolean>)
      : {}),
  };
  if (verb === "on" || verb === "off") {
    if (verb === "off") all[key(dir)] = true;
    else
      for (const r of Object.keys(all))
        if (
          key(dir) === r ||
          key(dir).startsWith(`${r}/`) ||
          r.startsWith(`${key(dir)}/`)
        )
          delete all[r];
    await $.store.set(KEY, all).catch(() => {});
  }
  return {
    text: `kit commit gate: ${(await offFor($, dir)) ? "off" : "on"} for this project`,
  };
}

export function commitGate(on: On) {
  // Bash only: flow sees its checks, and PowerShell's are not seen, so a held commit there could never clear.
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const command = (e as { command?: string }).command ?? "";
    if (!isCommit(command)) return next(e);
    const dir = await $.session.root().catch(() => undefined);
    if (dir && (await offFor($, dir))) return next(e);
    // An edit's repo still being found decides whether the task goes by this print (flow.ts).
    const block = await settled(async () => {
      await load($);
      return commitBlock(state.task, await taskPrint($));
    });
    return block ? { deny: block } : next(e);
  });
  on("command.run", { command: "commitgate" }, commitGateCommandRun);
}
