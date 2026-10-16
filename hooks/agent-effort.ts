import type { On } from "claude-code";

import { type Effort, isEffort } from "./model-policy";

// An Agent call can ask for an effort (Claude Code 2.1.292 and later), set only when you,
// CLAUDE.md or a skill asked for one: the profile then leaves that subagent's effort alone.
// Kept per tool_use_id from the call until the spawn beneath it has run.
const asked = new Map<string, Effort>();

export const askedEffort = (toolUseId: string): Effort | undefined =>
  asked.get(toolUseId);

export function agentCalls(on: On) {
  on("tool.call", { tool: "Agent" }, async (_$, e, next) => {
    const effort = (e as { effort?: unknown }).effort;
    if (!isEffort(effort)) return next(e);
    asked.set(e.tool_use_id, effort);
    try {
      return await next(e);
    } finally {
      asked.delete(e.tool_use_id);
    }
  });
}
