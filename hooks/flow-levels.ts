import type { EngineInterface } from "claude-code";

import { balance, balanceMeters } from "./balance";
import type { Change } from "./flow-policy";
import { log } from "./flow-store";
import type { Kind } from "./model-policy";
import {
  decide,
  decisionNote,
  escalate,
  isCouncil,
  type Levels,
  levelsText,
  roomOf,
  sameLevels,
  type VerifyNeed,
} from "./task-policy";

// Flow's side of task-policy.ts: a typed prompt's levels and note, their rise as the task
// grows or a check fails, each logged with both 5h meters, and the band's levels cell. flow.ts
// keeps the levels on the open task.

let shown: Levels | undefined; // the last decision's levels, for the band

// The band's levels cell: only the system in play now (define on a prompt, execute while
// code changes, verify while a check or the verifier runs) and only when its level is above 0.
type Phase = "d" | "e" | "v" | "r";
let phase: Phase | undefined;

export const flowLevels = (): string | undefined => {
  const n = shown && phase ? shown[phase] : 0;
  return phase && n > 0 ? `${phase.toUpperCase()}${n}` : undefined;
};

// Sets the active system; true when it changed, so the caller redraws the band.
export function setPhase(next: Phase | undefined): boolean {
  if (phase === next) return false;
  phase = next;
  return true;
}


export const showLevels = (l: Levels | undefined) => {
  shown = l;
  phase = l ? "d" : undefined;
};

const meters = () => {
  const m = balanceMeters();
  return { claude5h: m.claude.five_hour?.pct, gpt5h: m.gpt.five_hour?.pct };
};

export function redrawBand($: EngineInterface) {
  try {
    $.ui.invalidate("ui.render");
  } catch {
    // no band to redraw
  }
}

// A typed prompt's levels: a thin reply keeps the open task's; anything else is decided
// afresh, Execute and Verify never below the task it continues. A note only when it says
// something: within a task only when a level rose, never for all zero.
export async function promptLevels(
  $: EngineInterface,
  i: {
    text: string;
    kind: Kind;
    change: Change | undefined;
    verify: VerifyNeed | undefined;
    explore: boolean;
    ready: boolean;
    build: boolean;
    thin: boolean;
    prev: Levels | undefined; // the open task's, when this prompt continues it
    grew: boolean; // the prompt grew the open task's track
    task: number | undefined;
  },
): Promise<{ levels: Levels | undefined; note?: string }> {
  if (i.thin && i.prev) {
    shown = i.prev;
    redrawBand($);
    return { levels: i.prev };
  }
  const room = roomOf(i.ready, balanceMeters().gpt);
  // Growth raises the task's Execute and Verify by one, as an edit's growth does.
  const prev = i.grew && i.prev ? escalate(i.prev, room).levels : i.prev;
  const d = decide({
    kind: i.kind,
    change: i.change,
    verify: i.verify,
    explore: i.explore,
    build: i.build,
    council: isCouncil(i.text),
    room,
    prev,
  });
  shown = d.levels;
  phase = "d";
  await log($, {
    task: i.task,
    event: "decision",
    text: i.text.trim().slice(0, 60),
    kind: i.kind,
    change: i.build ? "heavy" : i.change,
    levels: levelsText(d.levels),
    reason: d.reasons.join("; ") || undefined,
    ...meters(),
  });
  redrawBand($);
  const l = d.levels;
  const was = i.prev; // what the task had before this prompt
  const rose = !was || l.d > was.d || l.e > was.e || l.v > was.v || l.r > was.r;
  return {
    levels: l,
    note:
      rose && Object.values(l).some((n) => n > 0) ? decisionNote(d) : undefined,
  };
}

// Flow growth or a failing check: Execute and Verify one up, with the note for it.
export async function raiseLevels(
  $: EngineInterface,
  levels: Levels | undefined,
  task: number,
  why: string,
): Promise<{ levels: Levels; note: string } | undefined> {
  if (!levels) return undefined;
  const now = await $.clock.now();
  const d = escalate(levels, roomOf(balance(now).ready, balanceMeters().gpt));
  if (sameLevels(levels, d.levels)) return undefined;
  shown = d.levels;
  await log($, {
    task,
    event: "levels",
    text: why,
    levels: levelsText(d.levels),
    reason: d.reasons.join("; ") || undefined,
    ...meters(),
  });
  redrawBand($);
  return { levels: d.levels, note: decisionNote(d) };
}
