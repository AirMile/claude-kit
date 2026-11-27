import type { CommandSpec, EngineInterface, On } from "claude-code";

import {
  addRow,
  IDLE_MS,
  isBusy,
  ledgerText,
  shouldCompact,
  threshold,
  type Boundary,
  type Restored,
  type Row,
} from "./context-policy";

export type { Restored };
import { clean } from "./guard-policy";
import { limitPaused } from "./limit-guard";

// The chat compacts itself once it sits idle after a turn (context-policy.ts says when).
// classic.Stop notes the boundary (register.tsx, after flow's verdict); register.tsx's
// turn.complete, the mod's only one, calls afterTurn, which runs /compact outside the hook after
// the boundary's idle wait. compaction.ts records every completed compaction in a per-project
// ledger. On by default; /kitcompact off turns it off for this project (/autocompact is Claude
// Code's own).

const OFF = "kit:autocompact";
const LEDGER = "kit:context-ledger";

export const autoCompactCommand: CommandSpec = {
  name: "kitcompact",
  description:
    "kit: compact the chat by itself once it sits idle after a turn (on by default)",
  argumentHint: "[on | off | status]",
  immediate: true,
};

// `epoch` goes up on anything that makes a planned compact stale: a prompt (also one queued
// while a turn runs), /clear, and every compaction (typing has its own count, `typed`). A boundary counts only when nothing came in
// since its turn started, and a planned compact runs only while the epoch is still the
// boundary's.
let epoch = 0;
let turnEpoch = 0; // the epoch when the current main-chat turn started
// Main-chat turns, counted here: $.session.turns() counts the transcript's user messages and
// drops after a compaction, which would defeat the cooldown.
let mainTurns = 0;
// The last turn's boundary, if it ended at one: its epoch and kind.
let boundary: { epoch: number; kind: Boundary } | null = null;
let lastCompactTurn: number | undefined;
let kitStarted = false; // the next completed compaction is ours
let broken = false; // compact failed in this chat: off until /clear or /kitcompact on
// Edits in the prompt box: one after a compact was planned cancels it. Apart from `epoch`, so a
// draft typed while the turn runs does not void that turn's boundary.
let typed = 0;

export function noteBoundary(kind: Boundary | null) {
  boundary = kind && epoch === turnEpoch ? { epoch, kind } : null;
}

// A main-chat compaction began (compaction.ts): a planned compact must not start a second one.
export function compactionStarted() {
  epoch += 1;
}

// A prompt came in (auto-model.ts), maybe queued behind the running turn.
export function notePrompt() {
  epoch += 1;
}

// /clear: a fresh chat starts without a boundary, a cooldown or an earlier failure.
export function resetAutoCompact() {
  epoch += 1;
  boundary = null;
  lastCompactTurn = undefined;
  broken = false;
}

const key = (dir: string) => clean(dir).replace(/\/$/, "").toLowerCase();

async function stored<T>(
  $: EngineInterface,
  k: string,
): Promise<Record<string, T>> {
  const v = await $.store.get(k).catch(() => undefined);
  return v && typeof v === "object" ? { ...(v as Record<string, T>) } : {};
}

async function isOn($: EngineInterface, dir: string): Promise<boolean> {
  const off = await stored<boolean>($, OFF);
  const k = key(dir);
  return !Object.keys(off).some(
    (r) => off[r] && (k === r || k.startsWith(`${r}/`)),
  );
}

async function rowsFor($: EngineInterface, dir: string): Promise<Row[]> {
  const v = (await stored<Row[]>($, LEDGER))[key(dir)];
  return Array.isArray(v) ? v : [];
}

// A main-chat turn that the model answered has ended (register.tsx): compact when the policy says so.
export async function afterTurn($: EngineInterface): Promise<void> {
  const typedAt = typed; // typing from here on, also during the reads below, cancels
  const noted = boundary;
  boundary = null;
  if (broken || noted === null || noted.epoch !== epoch || limitPaused())
    return;
  const planned = noted.epoch;
  const dir = await $.session.root().catch(() => undefined);
  if (!dir) return;
  const usage = await $.session.usage().catch(() => undefined);
  const turn = mainTurns;
  const used = usage?.context.tokens ?? 0;
  const window = usage?.context.window ?? 0;
  const d = shouldCompact({
    on: await isOn($, dir),
    boundary: true,
    used,
    window,
    turn,
    lastCompactTurn,
  });
  if (!d.compact) return;
  // Outside the hook, after the idle wait: $.command.run rejects inside a hook the turn waits
  // on. When it fires, everything is checked again after the last await: a prompt, a turn, /clear,
  // a compaction, the plan-limit pause or /kitcompact off since the boundary cancels it.
  const idle = IDLE_MS[noted.kind];
  $.clock.after(idle, async () => {
    const on = await isOn($, dir);
    if (!on || broken || epoch !== planned || typed !== typedAt || limitPaused())
      return;
    kitStarted = true;
    const why = noted.kind === "done" ? "task done" : "work waits on you";
    $.ui.toast(
      `kit: ${why}, idle ${Math.round(idle / 60_000)} min, context at ${Math.round(used / 1000)}k ` +
        `(threshold ${Math.round(threshold(window) / 1000)}k): compacting`,
    );
    try {
      const ran = await $.command.run({ command: "compact" });
      // A completed compaction cleared the flag (recordCompaction). Still set: core skipped it,
      // which starts no cooldown and must not mark a later compaction as ours.
      if (kitStarted) {
        kitStarted = false;
        const why = (ran as { text?: unknown } | undefined)?.text;
        $.ui.toast(
          `kit: auto-compact did not run${typeof why === "string" && why.trim() ? ` (${why.trim().slice(0, 120)})` : ""}; the next idle turn tries again`,
        );
      }
    } catch (err) {
      kitStarted = false;
      if (isBusy(err)) return; // the user went on: next boundary
      broken = true;
      $.ui.toast(
        `kit: auto-compact could not run here (${String(err)}); off for this session`,
      );
    }
  });
}

// A completed compaction (compaction.ts), any trigger but precompute.
export async function recordCompaction(
  $: EngineInterface,
  c: { trigger: string; before?: number; after?: number; notes?: Restored },
): Promise<void> {
  epoch += 1; // a planned compact is stale now
  const kit = kitStarted;
  kitStarted = false;
  lastCompactTurn = mainTurns;
  const dir = await $.session.root().catch(() => undefined);
  if (!dir) return;
  const all = await stored<Row[]>($, LEDGER);
  const k = key(dir);
  all[k] = addRow(Array.isArray(all[k]) ? all[k] : [], {
    at: await $.clock.now(),
    trigger: c.trigger,
    kit,
    before: c.before,
    after: c.after,
    ...(c.notes ? { notes: c.notes } : {}),
  });
  await $.store.set(LEDGER, all).catch(() => {});
}

export async function autoCompactCommandRun(
  $: EngineInterface,
  e: { args: string },
) {
  const dir = await $.session.root().catch(() => undefined);
  if (!dir) return { text: "kit autocompact: no project folder here." };
  const verb = e.args.trim().toLowerCase() || "status";
  if (verb === "on" || verb === "off") {
    const all = await stored<boolean>($, OFF);
    const k = key(dir);
    epoch += 1; // a compact planned before the switch is stale either way
    if (verb === "off") all[k] = true;
    else
      for (const r of Object.keys(all))
        if (k === r || k.startsWith(`${r}/`) || r.startsWith(`${k}/`))
          delete all[r];
    await $.store.set(OFF, all).catch(() => {});
    if (verb === "on") broken = false;
  }
  const window =
    (await $.session.usage().catch(() => undefined))?.context.window ?? 0;
  const state = broken
    ? "off for this session (compact failed)"
    : (await isOn($, dir))
      ? "on"
      : "off";
  return {
    text:
      `kit autocompact: ${state} for this project · threshold ${Math.round(threshold(window) / 1000)}k · ` +
      `after ${IDLE_MS.done / 60_000} min idle past a closed task, ${IDLE_MS.waiting / 60_000} min while work waits\n` +
      ledgerText(await rowsFor($, dir)),
  };
}

export function autoCompact(on: On) {
  // The main loop's turn begins: prompts submitted before it are its own, later ones are not.
  on("turn.start", async (_$, e, next) => {
    if (e.agentId === undefined) {
      mainTurns += 1;
      epoch += 1; // a turn without a prompt (a continuation) also voids a planned compact
      turnEpoch = epoch;
    }
    return next(e);
  });
  // Typing an answer (or a recalled or filled prompt) voids a planned compact: the chat never
  // compacts under the user's hands. Observed only, so the box is as the editor made it.
  on("prompt.edit", async (_$, e, next) => {
    typed += 1;
    return next(e);
  });
  on("prompt.change", async (_$, e, next) => {
    typed += 1;
    return next(e);
  });
  on("command.run", { command: "kitcompact" }, autoCompactCommandRun);
}
