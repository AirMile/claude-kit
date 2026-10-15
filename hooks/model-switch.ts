import type { EngineInterface } from "claude-code";

import {
  displayName,
  type Effort,
  family,
  isEffort,
  MODELS,
  switchOf,
  withSwitch,
} from "./model-policy";

// What is set beside the profile: the model main requests are rewritten to once auto-model.ts
// or the band switched away from the session's own (kept in $.store per session id, so a mod
// reload or restart keeps it), and an effort locked from the band (kept until unlocked).

const SWITCH_KEY = "switches";
const LOCK_KEY = "effortLock";

let chosen: string | undefined; // the model main requests are rewritten to
let base: string | undefined; // the session's model when `chosen` was picked
let restored = false; // this session's stored switch was looked up
let lock: Effort | null | undefined; // undefined: not read yet; null: none

// Drops the switch in memory; a new chat (`fresh`) also has nothing stored to pick up.
export function dropSwitch(fresh: boolean) {
  chosen = undefined;
  base = undefined;
  if (fresh) restored = true;
}

// The model main requests go to instead of the session's: none once the user picked
// another model by hand.
export async function override(
  $: EngineInterface,
): Promise<string | undefined> {
  await restoreSwitch($);
  return chosen && (await $.session.model()) === base ? chosen : undefined;
}

// The model main requests really go to.
export async function running($: EngineInterface): Promise<string> {
  return (await override($)) ?? (await $.session.model());
}

// Main requests go to `model` from now on (none when it is the session's own).
export async function switchTo($: EngineInterface, model: string) {
  const have = await $.session.model();
  const isOwn = family(model) === family(have);
  chosen = isOwn ? undefined : model;
  base = isOwn ? undefined : have;
  restored = true;
  try {
    const id = await $.session.id();
    const stored = await $.store.get(SWITCH_KEY);
    const s = chosen && base ? { chosen, base } : undefined;
    await $.store.set(SWITCH_KEY, withSwitch(stored, id, s));
  } catch {
    // Not kept across a reload, but this chat still switches.
  }
}

// The first look after a mod reload or restart picks this session's stored switch back up.
// True when it did.
export async function restoreSwitch($: EngineInterface): Promise<boolean> {
  if (restored) return false;
  restored = true;
  if (chosen) return false;
  try {
    const stored = await $.store.get(SWITCH_KEY);
    const saved = switchOf(stored, await $.session.id());
    if (!saved) return false;
    chosen = saved.chosen;
    base = saved.base;
    return true;
  } catch {
    return false; // nothing stored or no session id: the session's own model
  }
}

// The effort locked from the band: every main request runs at it until unlocked.
export async function effortLock(
  $: EngineInterface,
): Promise<Effort | undefined> {
  if (lock === undefined) {
    const stored = await $.store.get(LOCK_KEY).catch(() => undefined);
    lock = isEffort(stored) ? stored : null;
  }
  return lock ?? undefined;
}

export async function setEffortLock(
  $: EngineInterface,
  level: Effort | undefined,
) {
  lock = level ?? null;
  const saved = level ? $.store.set(LOCK_KEY, level) : $.store.delete(LOCK_KEY);
  await saved.catch(() => {});
}

// Clears or compacts between turns; false, with a toast, when it could not.
export async function reset(
  $: EngineInterface,
  way: "compact" | "clear",
): Promise<boolean> {
  try {
    if (way === "clear") await $.command.run({ command: "clear" });
    else {
      const done = await $.session.compact();
      if ("skip" in done && done.skip) throw new Error(done.skip);
    }
    return true;
  } catch (err) {
    $.ui.toast(`kit: could not ${way} (${String(err)})`);
    return false;
  }
}

// The first prompt's model question, when the profile picks `want` and the session runs
// another. A session that already has turns (a resume, a mod reload) keeps its model without
// asking. True when it asked.
export async function askFirstModel(
  $: EngineInterface,
  want: string,
): Promise<boolean> {
  if ((await $.session.turns()) > 1) return false;
  const have = await $.session.model();
  if (family(want) === family(have)) return false;
  // All models, the suggested one on top; the session's own reads "Stay on".
  const ordered = [want, ...MODELS.filter((m) => m !== want)];
  const labels = new Map(
    ordered.map((m) => [
      family(m) === family(have)
        ? `Stay on ${displayName(have)}`
        : `Switch to ${displayName(m)}`,
      m,
    ]),
  );
  const answer = await $.ui
    .ask(
      `This task fits ${displayName(want)}. Switch model for this session?`,
      { header: "Model", options: [...labels.keys()] },
    )
    .catch(() => undefined);
  const picked = answer === undefined ? undefined : labels.get(answer);
  if (picked && family(picked) !== family(have)) await switchTo($, picked);
  return true;
}
