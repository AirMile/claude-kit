import type { EngineInterface, PromptSubmitInput } from "claude-code";

import { limitPaused, settleForkCuts } from "./limit-guard";

type Item = (
  | { text: string; asUser: boolean }
  | { command: string; args: string }
) & { resume?: true; dropped?: string };

const RESUME_PROMPT =
  "kit: the plan limit has reset. Continue where you stopped before the pause.";
let kept: Item[] = [];
// The item is both the worker lock and its identity across a chat being left.
let sending: Item | null = null;
let left: Item | null = null; // was on its way when its chat was left

export function keptCount(): number {
  return kept.filter((item) => !item.resume).length;
}

export function hasKept(): boolean {
  return kept.length > 0;
}

export function queueInfo(): string {
  return kept.length && !sending ? `${kept.length} kept, not sent` : "";
}

export const sendingNow = (): boolean => sending !== null;

export function dropKept(): number {
  const n = keptCount();
  kept = [];
  left = sending;
  sending = null;
  return n;
}

// Only these origins may be replayed as the person's own words.
export function keepPrompt(e: PromptSubmitInput) {
  if (e.command) {
    kept.push({ command: e.command.name, args: e.command.args });
    return;
  }
  const origin = e.origin;
  const asUser = origin?.kind === "composer" || origin?.kind === "bridge" ||
    origin?.kind === "sdk" || (origin?.kind === "plugin" && origin.asUser === true);
  // The host refuses a plugin's prompt that starts with "/" (a path, say): a line goes before it.
  const text = e.text.trimStart().startsWith("/") ? `Kept prompt:\n${e.text}` : e.text;
  kept.push({ text, asUser });
}

export function keepResume() {
  if (!kept.some((item) => item.resume))
    kept.unshift({ text: RESUME_PROMPT, asUser: false, resume: true });
}

// A command kit runs reaches kit's own prompt.submit hook; a text prompt kit sends does not
// (the host skips the hooks of the plugin that raised it), so only commands are matched.
function runs(item: Item | null, e: PromptSubmitInput): boolean {
  if (!item || !("command" in item)) return false;
  const origin = e.origin;
  return origin?.kind === "plugin" && origin.name === "kit" && e.command?.name === item.command;
}

export function replayOf(e: PromptSubmitInput): Item | null {
  return runs(sending, e) ? sending : null;
}

// The command of a chat that was left, arriving after all: it belongs to no chat now.
export function leftBehind(e: PromptSubmitInput): boolean {
  return !replayOf(e) && runs(left, e);
}

// command.run resolves even when its prompt was dropped: only our prompt hook can see it.
export function replayDropped(item: Item | null, reason: string | undefined) {
  if (item && sending === item && reason !== undefined) item.dropped = reason;
}

// A forked command raises no prompt.submit and its loop no agent.spawn: a pause that cuts it
// shows only as a cut step of an agent nobody spawned, while the command ran.
const spawned = new Set<string>(); // subagents, which agent.spawn announced (auto-model.ts)
export function noteSpawned(agentId: string | undefined) {
  if (agentId) spawned.add(agentId);
}
let forkCuts = 0;
export function noteCutStep(agentId: string) {
  if (!spawned.has(agentId)) forkCuts += 1;
}
const prompted = new Set<string>(); // commands whose prompt reached the hook
export function notePrompted(name: string) {
  prompted.add(name);
}
// Call before the command runs; the result, after it, counts the fork steps cut meanwhile.
export function watchFork(name: string) {
  prompted.delete(name);
  const before = forkCuts;
  return () => (prompted.has(name) ? 0 : forkCuts - before);
}

export function keepCommand(command: string, args: string) {
  kept.push({ command, args });
}

export function replayKept($: EngineInterface) {
  if (kept.length) $.clock.after(0, () => void send($));
}

async function send($: EngineInterface) {
  if (sending) return;
  while (kept.length && !limitPaused()) {
    const item = kept[0]!;
    sending = item;
    delete item.dropped;
    let reason: string | undefined;
    try {
      // A test clock can resolve immediately, before the command hook returned. Yield to
      // the host once so it no longer treats this submit as part of command.run.
      await $.clock.now();
      if (sending !== item) {
        if (left === item) left = null; // never sent: nothing of it can arrive later
        return;
      }
      if (limitPaused()) item.dropped = "paused for the plan limit";
      else if ("command" in item) {
        const forkCut = watchFork(item.command);
        await $.command.run({ command: item.command, args: item.args });
        const cuts = forkCut();
        if (cuts) {
          settleForkCuts(cuts);
          item.dropped = "the pause cut it";
        }
      } else {
        const result = await $.prompt.submit({
          text: item.text, ...(item.asUser ? { asUser: true } : {}),
        });
        reason = result.drop;
      }
      reason = item.dropped ?? reason;
    } catch (err) {
      reason = String(err);
    }
    // /clear or /resume may have released this worker while the host was answering.
    if (left === item) left = null;
    if (sending !== item) return;
    sending = null;
    if (reason !== undefined) {
      const n = kept.length;
      $.ui.toast(
        `kit: a kept prompt was not sent (${reason}); ${n} prompt${n === 1 ? "" : "s"} still kept. /limit resume tries again.`,
        { timeoutMs: 10_000 },
      );
      $.ui.invalidate("ui.render");
      return;
    }
    kept.splice(kept.indexOf(item), 1); // remove only after it entered
    $.ui.invalidate("ui.render");
  }
}
