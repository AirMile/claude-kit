import type {
  EngineInterface,
  TurnStepInput,
  TurnStepResult,
} from "claude-code";

import { endPauseWarm, noteActive, warmForPause } from "./keep-warm";
import { clockTime, overLimit, type Reading, rise, stopAt } from "./limit-policy";

// Pauses this chat before the 5-hour plan limit runs out, has keep-warm.ts keep
// its prompt cache warm while the reset is near, and resumes at the reset.
// - register.tsx feeds every usage reading to noteLimits;
// - auto-model.ts asks limitStep before each model request (main and subagents) and
//   limitPrompt before a prompt enters; a paused prompt is queued and sent at the reset;
// - the band shows limitInfo and offers resumeNow.

const RESUME_PROMPT =
  "kit: the plan limit has reset. Continue where you stopped before the pause.";

type Pause = { until: number; percent: number; cut: boolean };

const last = new Map<string, Reading>();
let rises: number[] = []; // recent rises per reading, all windows
let paused: Pause | null = null;
let queued: string[] = [];
type Timer = ReturnType<EngineInterface["clock"]["after"]>;

let resumeTimer: Timer | null = null;

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
  if (paused) return;
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
  paused = { until, percent, cut: false };
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

// Ends the pause: at the reset, or by hand from the band (into extra usage, say).
export async function resumeNow($: EngineInterface) {
  if (!paused) return;
  const { cut } = paused;
  resumeTimer?.cancel();
  resumeTimer = null;
  endPauseWarm();
  paused = null;
  rises = [];
  const waiting = queued;
  queued = [];
  $.ui.invalidate("ui.render");
  if (cut) await $.prompt.submit({ text: RESUME_PROMPT }).catch(() => {});
  for (const text of waiting) await $.prompt.submit({ text }).catch(() => {});
}

// Before a model request: while paused, end the turn here instead (no request is made).
export async function limitStep(
  $: EngineInterface,
  e: TurnStepInput,
): Promise<TurnStepResult | null> {
  if (!paused) return null;
  paused.cut = true;
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
  text: string,
): Promise<string | null> {
  if (!paused) return null;
  queued = [...queued, text];
  const when = clockTime(paused.until, await $.clock.now());
  return `kit: paused for the plan limit; this prompt is sent at ${when}.`;
}

// The band's line while paused, empty otherwise.
export async function limitInfo($: EngineInterface): Promise<string> {
  if (!paused) return "";
  const parts = [
    `paused until ${clockTime(paused.until, await $.clock.now())}`,
  ];
  if (queued.length) parts.push(`${queued.length} queued`);
  return parts.join(" · ");
}
