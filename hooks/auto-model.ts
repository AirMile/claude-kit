import type { CommandSpec, EngineInterface, On } from "claude-code";

import {
  agentKind,
  commandKind,
  DEFAULT_MODE,
  displayName,
  type Effort,
  family,
  isMode,
  type Kind,
  kindOfLabel,
  LABELS,
  type Mode,
  pick,
  runLine,
  profileName,
  PROFILES,
} from "./model-policy";

// Picks model and effort before the model runs (it cannot change its own turn's effort):
// - the first prompt of a chat (a new session or after /clear) picks a model from the profile,
//   before the prompt is sent; when it differs from the session's, the user is asked to
//   switch or stay, and a switch rewrites every main request;
// - every prompt picks the effort;
// - a subagent the engine defines gets its own model and effort for its task.
// The profile (lean, balanced, quality, or off) is kept in $.store across sessions.

export const modeCommand: CommandSpec = {
  name: "mode",
  description:
    "Pick kit's model/effort profile: lean, balanced, quality or off",
  argumentHint: "[lean|balanced|quality|off]",
  immediate: true,
};

const STORE_KEY = "mode";
const CLASSIFY_CHARS = 4000;

let mode: Mode | undefined; // read from $.store on first use
let decided = false; // the session's model question was settled
let chosen: string | undefined; // the model main requests are rewritten to
let base: string | undefined; // the session's model when `chosen` was picked
let effort: Effort | undefined; // the effort for the current prompt's requests
const agentEffort = new Map<string, Effort>(); // subagent id → its effort

export async function getMode($: EngineInterface): Promise<Mode> {
  if (mode === undefined) {
    const stored = await $.store.get(STORE_KEY).catch(() => undefined);
    mode = isMode(stored) ? stored : DEFAULT_MODE;
  }
  return mode;
}

export async function setMode($: EngineInterface, next: Mode) {
  mode = next;
  await $.store.set(STORE_KEY, next).catch(() => {});
  if (next === "off") {
    chosen = undefined;
    effort = undefined;
  }
  await showStatus($);
  $.ui.invalidate("ui.render");
}

async function kindOf(
  $: EngineInterface,
  text: string,
): Promise<Kind | undefined> {
  const known = commandKind(text);
  if (known) return known;
  const label = await $.model
    .classify(text.slice(0, CLASSIFY_CHARS), Object.values(LABELS), {
      model: "haiku",
    })
    .catch(() => undefined);
  return kindOfLabel(label);
}

// True while main requests go to `chosen`: off once the user picked another model by hand.
async function overriding($: EngineInterface): Promise<boolean> {
  return !!chosen && (await $.session.model()) === base;
}

// What the band shows beside the profiles: the model main requests really go to (the
// picker keeps the session's) and the current effort; empty while off.
export async function runInfo($: EngineInterface): Promise<string> {
  if ((await getMode($)) === "off") return "";
  const model = (await overriding($)) ? chosen! : await $.session.model();
  return runLine(model, effort);
}

async function showStatus($: EngineInterface) {
  $.ui.invalidate("ui.render");
}

// The first prompt's model question. A session that already has turns (a resume, a mod
// reload) keeps its model without asking.
async function decideModel($: EngineInterface, kind: Kind, now: Mode) {
  decided = true;
  if (now === "off" || (await $.session.turns()) > 1) return;
  const want = pick(now, kind).model;
  const have = await $.session.model();
  if (family(want) === family(have)) return;
  const go = `Switch to ${displayName(want)}`;
  const answer = await $.ui
    .ask(
      `This task fits ${displayName(want)}. Switch model for this session?`,
      {
        header: "Model",
        options: [go, `Stay on ${displayName(have)}`],
      },
    )
    .catch(() => undefined);
  if (answer === go) {
    chosen = want;
    base = have;
  }
}

export function autoModel(on: On) {
  // A new chat (startup or /clear) asks again; a resume keeps the model it ran on.
  on(
    "classic.SessionStart",
    { source: /^(startup|clear)$/ },
    async ($, e, next) => {
      const started = await next(e);
      if (e.agent_type) return started;
      decided = false;
      chosen = undefined;
      base = undefined;
      effort = undefined;
      agentEffort.clear();
      await showStatus($);
      return started;
    },
  );

  on("prompt.submit", async ($, e, next) => {
    const now = await getMode($);
    const typed = e.origin.kind === "composer" || e.origin.kind === "bridge";
    if (now !== "off" && typed) {
      const kind = (await kindOf($, e.text)) ?? "routine";
      if (!decided) await decideModel($, kind, now);
      effort = pick(now, kind).effort;
      await showStatus($);
    }
    return next(e);
  });

  // A streaming event: the hook is a generator that forwards the chunks beneath.
  on("turn.step", async function* ($, e, next) {
    let step = e;
    if ((await getMode($)) !== "off") {
      if (e.agentId) {
        const own = agentEffort.get(e.agentId);
        if (own && e.effort !== undefined) step = { ...e, effort: own };
      } else {
        const model = (await overriding($)) ? chosen! : e.model;
        const level = effort && e.effort !== undefined ? effort : e.effort;
        step = { ...e, model, effort: level };
      }
    }
    return yield* next(step);
  });

  on("agent.spawn", async ($, e, next) => {
    const now = await getMode($);
    if (now === "off" || e.fork) return next(e);
    const isEngine = e.provider.plugin === "engine";
    const known = agentKind(e.subagentType);
    // A plugin's or user's agent keeps its own definition unless kit knows its work.
    if (!isEngine && !known) return next(e);
    const kind = known ?? (await kindOf($, e.prompt)) ?? "routine";
    const p = pick(now, kind);
    const spawned = await next(
      isEngine && !e.model ? { ...e, model: p.model } : e,
    );
    if (spawned.agentId) agentEffort.set(spawned.agentId, p.effort);
    return spawned;
  });

  on("command.run", { command: "mode" }, async ($, e) => {
    const arg = e.args.trim().toLowerCase();
    if (isMode(arg)) {
      await setMode($, arg);
      return { text: `kit profile: ${profileName(arg)}.` };
    }
    const now = await getMode($);
    return {
      text: `kit profile: ${profileName(now)}. Pick one: /mode ${[...PROFILES, "off"].join("|")}`,
    };
  });
}
