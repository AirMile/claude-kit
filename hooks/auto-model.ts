import type { CommandSpec, EngineInterface, On } from "claude-code";

import { limitPrompt, limitStep } from "./limit-guard";
import {
  agentKind,
  commandKind,
  DEFAULT_MODE,
  displayName,
  type Effort,
  escalation,
  isMode,
  type Kind,
  kindOfLabel,
  LABELS,
  type Mode,
  pick,
  profileName,
  PROFILES,
} from "./model-policy";
import {
  askFirstModel,
  dropSwitch,
  effortLock,
  override,
  reset,
  restoreSwitch,
  running,
  switchTo,
} from "./model-switch";
import { noteAgent } from "./chat-facts";
import { isOrchestrating, orchestrateNote } from "./orchestrate";

// Picks model and effort before the model runs (it cannot change its own turn's effort):
// - the first prompt of a chat (a new session or after /clear) picks a model from the profile,
//   before the prompt is sent; when it differs from the session's, the user is asked to
//   switch or stay, and a switch rewrites every main request;
// - every prompt picks the effort; a later prompt that needs a stronger model than the one
//   running escalates (model-policy.ts `escalation`): one tier short it runs at the top effort,
//   further short the user picks: switch now (light context only), compact or clear and then
//   switch and send it again, or stay at the top effort (not asked again this chat);
// - a subagent the engine defines gets its own model and effort for its task.
// The profile (lean, balanced, quality, or off) is kept in $.store across sessions, a switch
// per session id, so a mod reload or restart keeps it.

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
let stayed = false; // the user chose to stay on a weaker model: no more asking this chat
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
    dropSwitch(false);
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

// What the band shows: the model main requests really go to (the picker keeps the
// session's), and the effort they run at, `locked` when set from the band.
export async function runState($: EngineInterface) {
  const locked = await effortLock($);
  const off = (await getMode($)) === "off";
  return {
    model: await running($),
    effort: locked ?? (off ? undefined : effort),
    locked: !!locked,
  };
}

// The band's model switch: keep the context, or compact or clear it first.
export async function switchModel(
  $: EngineInterface,
  model: string,
  way: "keep" | "compact" | "clear",
) {
  if (way !== "keep" && !(await reset($, way))) return;
  decided = true; // picked by hand: a new chat asks nothing about it
  await switchTo($, model);
  await showStatus($);
}

async function showStatus($: EngineInterface) {
  $.ui.invalidate("ui.render");
}

type Way = "now" | "compact" | "clear" | "stay";

// A later prompt that needs `want`, above the model running. One tier short, or after the user
// chose to stay, it runs at the top effort; further short the user picks how to go on. Returns
// why the prompt is held when a clear or compact runs first and sends it again.
async function escalate(
  $: EngineInterface,
  text: string,
  want: string,
  mayAsk: boolean,
): Promise<string | undefined> {
  const have = await running($);
  const usage = await $.session.usage().catch(() => undefined);
  const step = escalation(have, want, usage?.context?.percent);
  if (step.step === "none") return undefined;
  if (step.step === "effort" || stayed || !mayAsk) {
    effort = "max";
    return undefined;
  }
  const to = displayName(step.want);
  const from = displayName(have);
  const ways = new Map<string, Way>();
  if (step.switchNow) ways.set(`Switch to ${to} now`, "now");
  ways.set(`Compact, then ${to}`, "compact");
  ways.set(`Clear, then ${to}`, "clear");
  ways.set(`Stay on ${from} at max effort`, "stay");
  const answer = await $.ui
    .ask(`This prompt needs ${to}; ${from} is running. How to go on?`, {
      header: "Model",
      options: [...ways.keys()],
    })
    .catch(() => undefined);
  const way = (answer !== undefined && ways.get(answer)) || "stay";
  if (way === "now") {
    await switchTo($, step.want);
    return undefined;
  }
  if (way === "stay") {
    stayed = true;
    effort = "max";
    return undefined;
  }
  const level = effort;
  // Outside the hook: a clear or compact rejects inside the hook the prompt waits on.
  $.clock.after(300, () => resend($, way, step.want, text, level));
  return `kit: ${way === "clear" ? "clearing" : "compacting"}, then ${to} runs your prompt`;
}

// Clears or compacts, switches to `want` and sends the held prompt again. On a failure the
// prompt goes back into the input box, so nothing typed is lost.
async function resend(
  $: EngineInterface,
  way: "compact" | "clear",
  want: string,
  text: string,
  level: Effort | undefined,
) {
  if (!(await reset($, way))) {
    await $.prompt.fill({ text }).catch(() => {}); // the prompt is back in the input box
    return;
  }
  decided = true;
  await switchTo($, want);
  effort = level;
  await showStatus($);
  await $.prompt.submit({ text, asUser: true }).catch(async (err) => {
    $.ui.toast(`kit: could not send your prompt (${String(err)})`);
    await $.prompt.fill({ text }).catch(() => {});
  });
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
      stayed = false;
      dropSwitch(true); // a new chat: nothing stored to pick up
      effort = undefined;
      agentEffort.clear();
      await showStatus($);
      return started;
    },
  );

  on("prompt.submit", async ($, e, next) => {
    const held = await limitPrompt($, e.text);
    if (held) {
      $.ui.toast(held, { timeoutMs: 10_000 });
      return { drop: held };
    }
    const now = await getMode($);
    const typed = e.origin.kind === "composer" || e.origin.kind === "bridge";
    const orchestrating = typed && (await isOrchestrating($));
    if (!typed || (now === "off" && !orchestrating)) return next(e);
    const kind = (await kindOf($, e.text)) ?? "routine";
    if (now !== "off") {
      const p = pick(now, kind);
      if (await restoreSwitch($)) decided = true; // a reload kept the switch
      let asked = false;
      if (!decided) {
        decided = true;
        asked = await askFirstModel($, p.model);
      }
      effort = p.effort;
      // The first prompt's question just settled the model: no second one for it.
      const parked = await escalate($, e.text, p.model, !asked);
      await showStatus($);
      if (parked) {
        $.ui.toast(parked, { timeoutMs: 10_000 });
        return { drop: parked };
      }
    }
    // Orchestrate (the band's ⑂): a note for this kind of work rides along with the prompt.
    const note = orchestrating ? orchestrateNote(kind) : undefined;
    return next(note ? { ...e, context: [...(e.context ?? []), note] } : e);
  });

  // A streaming event: the hook is a generator that forwards the chunks beneath.
  on("turn.step", async function* ($, e, next) {
    const stopped = await limitStep($, e); // the plan limit is nearly used up
    if (stopped) return stopped;
    let step = e;
    const isOn = (await getMode($)) !== "off";
    if (e.agentId) {
      const own = agentEffort.get(e.agentId);
      if (isOn && own && e.effort !== undefined) step = { ...e, effort: own };
    } else {
      // An effort locked from the band holds even with the profile off.
      const model = isOn ? ((await override($)) ?? e.model) : e.model;
      const want = (await effortLock($)) ?? (isOn ? effort : undefined);
      const level = want && e.effort !== undefined ? want : e.effort;
      step = { ...e, model, effort: level };
    }
    return yield* next(step);
  });

  on("agent.spawn", async ($, e, next) => {
    noteAgent(e.subagentType);
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
