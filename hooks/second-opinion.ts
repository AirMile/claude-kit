import type { EngineInterface } from "claude-code";

import { displayName, family } from "./model-policy";

// The band's second opinion: another model weighs in on what this chat is working on, reviews
// its changes, or looks at a bug the chat is stuck on. A pick is a prompt sent as the person's
// own, just after the press; this chat's model writes the brief (the other model starts cold)
// and sets both judgments side by side. A GPT model runs through Codex, read-only, as the GPT
// delegation instructions in the user's CLAUDE.md say (they map the name to a model id, so
// only names live here); a Claude model runs as a fresh subagent on that model. Only models at
// least as strong as the main one: a weaker opinion adds little.

export const GPT = ["Sol 6.1", "Astra 6"] as const;
export const CLAUDE = ["claude-opus-5-5", "claude-sonnet-5-5"] as const;
export const ASKS = ["Opinion", "Review", "Stuck"] as const;
export type Ask = (typeof ASKS)[number];

// What the band calls a pick: a GPT name as is, a Claude id as `Opus 5.5`.
export const whoName = (who: string): string =>
  family(who) ? displayName(who) : who;

const TASKS: Record<Ask, (by: string) => string> = {
  Opinion: (by) =>
    `Get a second opinion from ${by} on what we are working on now: the question, plan or decision at hand.`,
  Review: (by) =>
    `Have ${by} review the current changes: the uncommitted diff or, with a clean tree, the branch's commits against the default branch.`,
  Stuck: (by) =>
    `We are stuck on the current problem. Have ${by} diagnose it: give it the exact error or symptom, what we tried and why that failed, and the suspect files; ask for the likely cause and the next check, not a rewrite.`,
};

// `who` is a Claude model id (`claude-opus-5-5`) or a name from GPT.
export function opinionPrompt(who: string, ask: Ask): string {
  const claude = family(who);
  const by = claude
    ? `${displayName(who)} in a fresh subagent (Agent tool, model "${claude}", read-only: it edits nothing)`
    : `GPT ${who} through Codex (read-only, as the GPT delegation instructions say)`;
  return `${TASKS[ask](by)} It starts cold: give it the goal, the constraints, the relevant files and what to check. Then show its findings next to your own judgment: where you agree, where not, and why.`;
}

let sent = 0; // when a model was last pressed: a press within 2s is a double click

export async function askOpinion($: EngineInterface, who: string, ask: Ask) {
  const now = await $.clock.now();
  if (now - sent < 2000) return;
  sent = now;
  $.clock.after(50, async () => {
    await $.prompt
      .submit({ text: opinionPrompt(who, ask), asUser: true })
      .catch((err) =>
        $.ui.toast(`kit: could not ask for a second opinion (${String(err)})`),
      );
  });
}
