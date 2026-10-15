import type { EngineInterface } from "claude-code";

import { runState } from "./auto-model";
import type { Chat } from "./roadmap-parts";

// What the roadmap pane's Chat tab shows. register.tsx and auto-model.ts note what this chat
// touched (files written or edited, subagents, compactions) as it happens, so it counts from
// when the mod loaded; a /clear starts over.

const files = new Set<string>();
const agents = new Map<string, number>();
let compactions = 0;

export function noteFile(path: string) {
  files.add(path.replace(/\\/g, "/"));
}

export function noteAgent(type: string) {
  agents.set(type, (agents.get(type) ?? 0) + 1);
}

export function noteCompact() {
  compactions += 1;
}

export function resetChat() {
  files.clear();
  agents.clear();
  compactions = 0;
}

// The run, the session's usage (the context by category, as /context estimates it) and
// what this chat touched, paths relative to the project.
export async function readChat($: EngineInterface): Promise<Chat> {
  const run = await runState($);
  const usage = await $.session
    .usage({ breakdown: "summary" })
    .catch(() => undefined);
  const b = usage?.context.breakdown;
  const root = (await $.session.root().catch(() => "")).replace(/\\/g, "/");
  const now = await $.clock.now();
  return {
    model: run.model,
    effort: run.effort,
    locked: run.locked,
    turns: await $.session.turns().catch(() => 0),
    minutes: usage
      ? Math.max(0, Math.round((now - usage.startedAt) / 60000))
      : 0,
    usd: usage?.cost?.usd,
    context: (b?.categories ?? [])
      .filter((c) => !c.isDeferred && c.tokens > 0 && !/free/i.test(c.name))
      .map((c) => ({ name: c.name, tokens: c.tokens })),
    used: b?.totalTokens ?? usage?.context.tokens ?? 0,
    max: b?.maxTokens ?? usage?.context.window ?? 0,
    files: [...files].map((f) =>
      root && f.startsWith(`${root}/`) ? f.slice(root.length + 1) : f,
    ),
    agents: [...agents].map(([type, n]) => ({ type, n })),
    compactions,
  };
}
