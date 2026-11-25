import type {
  CommandRunInput,
  CommandRunResult,
  EngineInterface,
  PromptSubmitInput,
  TurnStepInput,
  TurnStepResult,
} from "claude-code";

import {
  endPauseWarm,
  noteActive,
  syncHold,
  warmForPause,
  warmHold,
} from "./keep-warm";
import {
  clockTime,
  DEFAULT_HOLD,
  type Hold,
  holdOf,
  overLimit,
  type Reading,
  rise,
  stopAt,
  withHold,
} from "./limit-policy";

import {
  dropKept, hasKept, keepCommand, keepPrompt, keepResume, keptCount, leftBehind,
  noteCutStep, notePrompted, queueInfo, replayDropped, replayKept, replayOf, watchFork,
} from "./limit-queue";

// Pauses this chat before the 5-hour plan limit runs out, has keep-warm.ts keep
// its prompt cache warm while the reset is near, and resumes at the reset.
// - register.tsx feeds every usage reading to noteLimits;
// - auto-model.ts asks limitStep before each model request (main and subagents) and
//   limitPrompt before a prompt enters; a paused prompt is queued and sent at the reset;
// - the band shows limitInfo and offers resumeNow, and its limit button cycles the chat's
//   hold (getHold/setHold): off, pause (warm while work is open) or warm (also while idle;
//   /warm sets it). keep-warm.ts follows the hold.

// What the pause cut: the main turn, and the steps of subagents and forks.
type Pause = { until: number; percent: number; cut: boolean; agentCuts: number };

const last = new Map<string, Reading>();
let rises: number[] = []; // recent rises per reading, all windows
let paused: Pause | null = null;
// While paused near the plan limit nothing should spend tokens (auto-compact.ts).
export const limitPaused = (): boolean => paused !== null;
type Timer = ReturnType<EngineInterface["clock"]["after"]>;

let resumeTimer: Timer | null = null;

const HOLD_KEY = "limitHold";
let hold: Hold = DEFAULT_HOLD;
let holdFor: string | null | undefined; // the session `hold` belongs to; undefined: not read

async function sessionId($: EngineInterface): Promise<string | null> {
  try {
    return await $.session.id();
  } catch {
    return null; // no session id: the hold lives in memory only
  }
}

// This chat's hold, read from $.store when the session changes (a new chat, a reload). True
// when it was read now.
async function readSession($: EngineInterface): Promise<boolean> {
  const id = await sessionId($);
  if (id === holdFor) return false;
  holdFor = id;
  const stored = id
    ? await $.store.get(HOLD_KEY).catch(() => undefined)
    : undefined;
  hold = id ? holdOf(stored, id) : DEFAULT_HOLD;
  syncHold($, hold);
  return true;
}

export async function getHold($: EngineInterface): Promise<Hold> {
  // A failed ping turned keep warm off: stored, and nothing kept is sent for it.
  if (!(await readSession($)) && hold === "warm" && warmHold() !== "warm")
    await storeHold($, DEFAULT_HOLD);
  return hold;
}

async function storeHold($: EngineInterface, next: Hold) {
  hold = next;
  syncHold($, next);
  if (holdFor) {
    const stored = await $.store.get(HOLD_KEY).catch(() => undefined);
    await $.store
      .set(HOLD_KEY, withHold(stored, holdFor, next))
      .catch(() => {});
  }
  $.ui.invalidate("ui.render");
}

// Set by hand: on this chat, also right after a /clear that nothing has read yet.
export async function setHold($: EngineInterface, next: Hold) {
  await readSession($);
  await storeHold($, next);
  if (next !== "pause") await resumeNow($); // Off and Warm never hold a chat
}

// /warm: on is the hold with keep warm, off drops back to Off (the default).
export async function warmCommandRun($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase();
  const now = await getHold($);
  const on = arg === "on" ? true : arg === "off" ? false : now !== "warm";
  await setHold($, on ? "warm" : now === "warm" ? DEFAULT_HOLD : now);
  return on
    ? "Keep warm on: after 50 idle minutes a tiny request renews the prompt cache."
    : "Keep warm off.";
}

export async function noteLimits(
  $: EngineInterface,
  readings: readonly Reading[],
) {
  await noteActive($);
  for (const r of readings) {
    const d = rise(last.get(r.kind), r);
    if (d !== null) rises = [...rises, d].slice(-5);
    last.set(r.kind, r);
  }
  if (paused || (await getHold($)) !== "pause") return; // only the Limit hold pauses
  const now = await $.clock.now();
  const hit = overLimit(readings, stopAt(rises), now);
  if (hit) await pause($, hit.until, hit.percent, now);
}

async function pause(
  $: EngineInterface,
  until: number,
  percent: number,
  now: number,
) {
  paused = { until, percent, cut: false, agentCuts: 0 };
  $.ui.toast(
    `kit: plan limit at ${Math.round(percent)}%, paused until ${clockTime(until, now)}. ` +
      "Prompts you send now are kept and sent then.",
    { timeoutMs: 10_000 },
  );
  // A tick past the reset, so the first reading after it is fresh.
  resumeTimer = $.clock.after(until - now + 60_000, () => void resumeNow($));
  warmForPause($, until);
  $.ui.invalidate("ui.render");
}

function endPause($: EngineInterface) {
  resumeTimer?.cancel();
  resumeTimer = null;
  endPauseWarm();
  paused = null;
  rises = [];
  $.ui.invalidate("ui.render");
}

// /clear or /resume ends this chat: its pause goes with it, and the kept prompts are
// dropped, since sending them would put them in another chat.
export function leavePause($: EngineInterface) {
  if (!paused && !hasKept()) return;
  const wasPaused = !!paused;
  const n = dropKept();
  endPause($);
  const count = n ? `${n} kept prompt${n === 1 ? "" : "s"} dropped` : "";
  if (!wasPaused && !count) return;
  const said = wasPaused
    ? `the pause ended with that chat${count ? `; ${count}` : ""}`
    : `${count} with that chat`;
  $.ui.toast(`kit: ${said}.`, { timeoutMs: 10_000 });
}

// No command hook waits for replay: the worker starts outside it, also on a retry.
export async function resumeNow($: EngineInterface) {
  if (paused) {
    const { cut, agentCuts } = paused;
    endPause($);
    if (cut || agentCuts > 0) keepResume();
  }
  const waiting = hasKept();
  replayKept($);
  return waiting;
}

// Before a model request: while paused, end the turn here instead (no request is made).
export async function limitStep(
  $: EngineInterface,
  e: TurnStepInput,
): Promise<TurnStepResult | null> {
  if (!paused) return null;
  if (e.agentId) {
    paused.agentCuts += 1;
    noteCutStep(e.agentId);
  } else paused.cut = true;
  const when = clockTime(paused.until, await $.clock.now());
  return {
    turnId: e.turnId,
    index: e.index,
    answer: `kit: paused for the plan limit until ${when}; this continues then.`,
    toolUses: [],
    stopReason: "end_turn",
    usage: null,
  };
}

// Before a prompt enters: while paused, keep it for the reset; the reason says so.
export async function limitPrompt(
  $: EngineInterface,
  e: PromptSubmitInput,
): Promise<string | null> {
  if (e.command) notePrompted(e.command.name);
  if (leftBehind(e)) return "kit: dropped with the chat it was kept in.";
  if (!paused) return null;
  const replay = replayOf(e);
  const keep = replay || !e.command || (await isPromptCommand($, e.command.name));
  const now = await $.clock.now();
  if (!paused) return null; // the pause ended while the command was looked up
  const attachments = e.attachments?.length ? " attachments are not kept." : "";
  const held =
    `kit: paused for the plan limit; this prompt is sent at ${clockTime(paused.until, now)}.`;
  if (replay) {
    replayDropped(replay, held);
    return held;
  }
  if (!keep)
    return (
      `kit: paused for the plan limit; /${e.command?.name} is built in or unknown, so it is ` +
      "not sent again; what it already did stands. Run it again after the pause if " +
      "nothing happened." + attachments
    );
  keepPrompt(e);
  return held + attachments;
}

// Around a typed command: a forked one raises no prompt.submit, so a pause that cuts its
// subagent is seen only here. It is kept and run again after the pause.
export async function limitCommandWatch(
  $: EngineInterface,
  e: CommandRunInput,
  next: (e: CommandRunInput) => Promise<CommandRunResult>,
): Promise<CommandRunResult> {
  const forkCut = watchFork(e.command);
  const ran = await next(e);
  const cuts = forkCut();
  if (!cuts) return ran;
  const keep = await isPromptCommand($, e.command);
  const now = await $.clock.now();
  let said = "is not kept; run it again after the pause";
  if (keep && paused) {
    settleForkCuts(cuts); // it runs again: no "continue" prompt on its account
    keepCommand(e.command, e.args);
    said = `is kept, it runs again at ${clockTime(paused.until, now)}`;
    $.ui.invalidate("ui.render");
  }
  $.ui.toast(`kit: the plan-limit pause cut /${e.command}; it ${said}.`, {
    timeoutMs: 10_000,
  });
  return ran;
}

// Cut steps of a command that is kept are made good by running it again.
export function settleForkCuts(n: number) {
  if (paused) paused.agentCuts = Math.max(0, paused.agentCuts - n);
}

// Built-in prompt commands the skill listing leaves out (the person's to run only); measured
// live. One that is missing here is not kept, and the chat says so.
const PROMPT_BUILTINS = ["batch", "debug", "run-skill-generator"];

async function isPromptCommand($: EngineInterface, name: string): Promise<boolean> {
  try {
    const command = (await $.command.list()).find((c) => c.name === name);
    if (!command) return false;
    if (command.source !== "builtin" || PROMPT_BUILTINS.includes(name)) return true;
    const usage = await $.session.usage({ breakdown: "summary" });
    return !!usage.context.breakdown?.skills?.skillFrontmatter.some((s) => s.name === name);
  } catch {
    return false; // never repeat a command whose effects we cannot identify
  }
}

// Keep the band's retry button available after a refused send.
export async function limitInfo($: EngineInterface): Promise<string> {
  if (!paused) return queueInfo();
  const parts = [
    `paused until ${clockTime(paused.until, await $.clock.now())}`,
  ];
  const n = keptCount();
  if (n) parts.push(`${n} queued`);
  return parts.join(" · ");
}
