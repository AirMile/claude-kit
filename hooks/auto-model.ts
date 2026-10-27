import type { CommandSpec, EngineInterface, On } from "claude-code";

import { agentCalls, askedEffort } from "./agent-effort";
import { limitPrompt, limitStep } from "./limit-guard";
import {
  agentKind,
  carry,
  commandKind,
  DEFAULT_MODE,
  displayName,
  type Effort,
  escalation,
  family,
  isMode,
  type Kind,
  kindOfLabel,
  LABELS,
  type Mode,
  pick,
  type Profile,
  profileName,
  PROFILES,
  stretch,
  subagentEffort,
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
import { flowMode, flowPrompt, flowSpawned } from "./flow";

// Picks model and effort before the model runs (it cannot change its own turn's effort):
// - the first prompt of a chat (a new session or after /clear) picks a model from the profile,
//   before the prompt is sent; when it differs from the session's, the user is asked to
//   switch or stay, and a switch rewrites every main request;
// - every prompt picks the effort (a short reply like "ja" keeps the kind of work it continues);
//   a later prompt that needs a stronger model than the one running escalates (model-policy.ts
//   `escalation`, `escalate` below): never a switch without asking;
// - a subagent the engine defines gets its own model and effort for its task, unless its Agent
//   call asked for an effort (agent-effort.ts).
// The profile (lean, balanced, quality, off) is kept in $.store across sessions, a switch per
// session id, so a mod reload or restart keeps it.

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
let kept: "agent" | "stay" | undefined; // how this chat goes on when a prompt needs a far stronger model
let escalated: string | undefined; // the subagent note for the prompt being sent
let effort: Effort | undefined; // the effort for the current prompt's requests
let lastKind: Kind | undefined; // the kind of work the last typed prompt ran as
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

// What the band shows: whether kit picks (auto), the model main requests really go to (the
// picker keeps the session's) and the effort they run at: kit's pick, or with the profile off
// the band's effort (undefined: the session's own).
export async function runState($: EngineInterface) {
  const auto = (await getMode($)) !== "off";
  return {
    auto,
    model: await running($),
    effort: auto ? effort : await effortLock($),
  };
}

async function showStatus($: EngineInterface) {
  $.ui.invalidate("ui.render");
}

type Way = "agent" | "now" | "compact" | "clear" | "stay";

// What a later prompt that needs `want`, above the model running, does. One tier short it runs at
// the stretch effort. Further short the user picks, none marked as recommended: a subagent on
// `want` for the hard part (the chat keeps its model and cache), switch now (light context only: a switch reads the whole
// chat again without the cache), compact or clear and then switch and send it again, or stay at
// the stretch effort. A subagent or stay holds for the rest of the chat, without asking again.
// Returns why the prompt is held (`drop`) or a note that rides along with it.
async function escalate(
  $: EngineInterface,
  text: string,
  want: string,
  mayAsk: boolean,
): Promise<{ drop?: string; note?: string }> {
  const have = await running($);
  const usage = await $.session.usage().catch(() => undefined);
  const step = escalation(have, want, usage?.context?.percent);
  if (step.step === "none") return {};
  if (step.step === "effort" || kept === "stay" || !mayAsk) {
    effort = stretch(have);
    return {};
  }
  const to = displayName(step.want);
  const from = displayName(have);
  const note = `kit: this prompt needs ${to}; ${from} runs this chat. Hand its hard part (the diagnosis, the design, the tricky change) to a subagent with the Agent tool, model "${family(step.want)}": give it the goal, the constraints and the relevant files, then carry out its answer here. Do the rest yourself.`;
  if (kept === "agent") return { note };
  const ways = new Map<string, Way>();
  ways.set(`Ask a ${to} subagent`, "agent");
  // A question holds four options: with a light context a switch now beats compacting first.
  if (step.switchNow) ways.set(`Switch to ${to} now`, "now");
  else ways.set(`Compact, then ${to}`, "compact");
  ways.set(`Clear, then ${to}`, "clear");
  ways.set(`Stay on ${from} at ${stretch(have)} effort`, "stay");
  const answer = await $.ui
    .ask(`This prompt needs ${to}; ${from} is running. How to go on?`, {
      header: "Model",
      options: [...ways.keys()],
    })
    .catch(() => undefined);
  const way = (answer !== undefined && ways.get(answer)) || "stay";
  if (way === "agent") {
    kept = "agent";
    return { note };
  }
  if (way === "now") {
    await switchTo($, step.want);
    return {};
  }
  if (way === "stay") {
    kept = "stay";
    effort = stretch(have);
    return {};
  }
  const level = effort;
  // Outside the hook: a clear or compact rejects inside the hook the prompt waits on.
  $.clock.after(300, () => resend($, way, step.want, text, level));
  return {
    drop: `kit: ${way === "clear" ? "clearing" : "compacting"}, then ${to} runs your prompt`,
  };
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

// The profile's part of a typed prompt: the model and effort for its kind of work, the first
// prompt's model question, and the escalation when it needs a stronger model. Returns why the
// prompt is held, if it is.
async function profilePick(
  $: EngineInterface,
  profile: Profile,
  kind: Kind,
  text: string,
): Promise<{ drop?: string }> {
  // A command's kind is explicit; a thin reply keeps the work's kind.
  const ran = commandKind(text) ? kind : carry(kind, lastKind, text);
  lastKind = ran;
  const p = pick(profile, ran);
  if (await restoreSwitch($)) decided = true; // a reload kept the switch
  let asked = false;
  if (!decided) {
    decided = true;
    asked = await askFirstModel($, p.model);
  }
  effort = p.effort;
  // The first prompt's question just settled the model: no second one for it.
  const step = await escalate($, text, p.model, !asked);
  await showStatus($);
  if (step.drop) return { drop: step.drop };
  if (step.note) escalated = step.note;
  return {};
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
      kept = undefined;
      dropSwitch(true); // a new chat: nothing stored to pick up
      effort = undefined;
      lastKind = undefined;
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
    // Typed, or started by kit on the user's own click (the roadmap pane, Fresh start).
    const typed =
      e.origin.kind === "composer" ||
      e.origin.kind === "bridge" ||
      (e.origin.kind === "plugin" && e.origin.name === "kit");
    const flowing = (await flowMode($)) !== "off";
    if (!typed || (now === "off" && !flowing)) return next(e);
    const kind = (await kindOf($, e.text)) ?? "routine";
    // The profile picks the model and effort; flow (flow.ts) the workflow. Neither needs the
    // other.
    const step: { drop?: string } =
      now === "off" ? {} : await profilePick($, now, kind, e.text);
    if (step.drop) {
      $.ui.toast(step.drop, { timeoutMs: 10_000 });
      return { drop: step.drop };
    }
    const notes = [
      escalated,
      flowing ? await flowPrompt($, e.text, kind) : undefined,
    ].filter((n): n is string => n !== undefined);
    escalated = undefined;
    return next(
      notes.length ? { ...e, context: [...(e.context ?? []), ...notes] } : e,
    );
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
      // A profile picks the effort; with it off the band's effort holds, if one is set.
      const model = isOn ? ((await override($)) ?? e.model) : e.model;
      const want = isOn ? effort : await effortLock($);
      const level = want && e.effort !== undefined ? want : e.effort;
      step = { ...e, model, effort: level };
    }
    return yield* next(step);
  });

  on("agent.spawn", async ($, e, next) => {
    noteAgent(e.subagentType);
    const now = await getMode($);
    if (now === "off" || e.fork) {
      const started = await next(e);
      flowSpawned(started.agentId, e.subagentType); // flow reads the verifier's answer
      return started;
    }
    const isEngine = e.provider.plugin === "engine";
    const known = agentKind(e.subagentType);
    // A plugin's or user's agent keeps its own definition unless kit knows its work.
    if (!isEngine && !known) {
      const started = await next(e);
      flowSpawned(started.agentId, e.subagentType);
      return started;
    }
    const kind = known ?? (await kindOf($, e.prompt)) ?? "routine";
    const p = pick(now, kind);
    const spawned = await next(
      isEngine && !e.model ? { ...e, model: p.model } : e,
    );
    flowSpawned(spawned.agentId, e.subagentType);
    const own = subagentEffort(askedEffort(e.tool_use_id), p.effort);
    if (spawned.agentId && own) agentEffort.set(spawned.agentId, own);
    return spawned;
  });

  agentCalls(on);

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
