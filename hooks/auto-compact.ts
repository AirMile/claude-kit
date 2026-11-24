import type { CommandSpec, EngineInterface, On } from "claude-code";

import {
  addRow,
  isBusy,
  ledgerText,
  shouldCompact,
  threshold,
  type Row,
} from "./context-policy";
import { clean } from "./guard-policy";
import { limitPaused } from "./limit-guard";

// The chat compacts itself at a task boundary (context-policy.ts says when). classic.Stop
// notes the boundary (register.tsx, after flow's verdict); fresh-start.ts's turn.complete, the
// mod's only one, calls afterTurn, which runs /compact outside the hook once the session is
// idle. compaction.ts records every completed compaction in a per-project ledger. On by
// default; /autocompact off turns it off for this project.

const OFF = "kit:autocompact";
const LEDGER = "kit:context-ledger";

export const autoCompactCommand: CommandSpec = {
  name: "autocompact",
  description:
    "kit: compact the chat by itself at a task boundary (on by default)",
  argumentHint: "[on | off | status]",
  immediate: true,
};

// `epoch` goes up on anything that makes a planned compact stale: a prompt (also one queued
// while a turn runs), /clear, and every compaction. A boundary counts only when nothing came in
// since its turn started, and a planned compact runs only while the epoch is still the
// boundary's.
let epoch = 0;
let turnEpoch = 0; // the epoch when the current main-chat turn started
// Main-chat turns, counted here: $.session.turns() counts the transcript's user messages and
// drops after a compaction, which would defeat the cooldown.
let mainTurns = 0;
let boundary: number | null = null; // the epoch of the last turn's boundary, if it ended at one
let lastCompactTurn: number | undefined;
let kitStarted = false; // the next completed compaction is ours
let broken = false; // compact failed in this chat: off until /clear or /autocompact on

export function noteBoundary(atBoundary: boolean) {
  boundary = atBoundary && epoch === turnEpoch ? epoch : null;
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

// A main-chat turn that the model answered has ended (fresh-start.ts): compact when the policy says so.
export async function afterTurn($: EngineInterface): Promise<void> {
  const planned = boundary;
  boundary = null;
  if (broken || planned === null || planned !== epoch || limitPaused()) return;
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
  // Outside the hook: $.command.run rejects inside a hook the turn waits on. When it fires,
  // everything is checked again after the last await: a prompt, /clear, a compaction, the
  // plan-limit pause or /autocompact off since the boundary cancels it.
  $.clock.after(300, async () => {
    const on = await isOn($, dir);
    if (!on || broken || epoch !== planned || limitPaused()) return;
    kitStarted = true;
    $.ui.toast(
      `kit: task done, context at ${Math.round(used / 1000)}k (threshold ${Math.round(threshold(window) / 1000)}k): compacting`,
    );
    try {
      await $.command.run({ command: "compact" });
      // A skipped compaction records nothing: the cooldown still starts, and the flag must not
      // mark a later one as ours.
      lastCompactTurn = mainTurns;
      kitStarted = false;
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
  c: { trigger: string; before?: number; after?: number },
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
      `kit autocompact: ${state} for this project · threshold ${Math.round(threshold(window) / 1000)}k at a task boundary\n` +
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
  on("command.run", { command: "autocompact" }, autoCompactCommandRun);
}
