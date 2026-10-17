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
  isMode,
  type Kind,
  kindOfLabel,
  LABELS,
  type Mode,
  pick,
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
// - every prompt picks the effort (a short reply like "ja" keeps the kind of work it continues);
//   the model stays for the whole chat: a later prompt that needs a stronger model than the one
//   running runs at the stretch effort (model-policy.ts `escalation`), never a switch;
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

// A later prompt that needs `want`, above the model running: the chat keeps its model (a switch
// mid-chat reads the whole chat again without the cache) and runs it at the stretch effort.
async function escalate($: EngineInterface, want: string) {
  const have = await running($);
  const usage = await $.session.usage().catch(() => undefined);
  if (escalation(have, want, usage?.context?.percent).step !== "none")
    effort = stretch(have);
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
    const typed = e.origin.kind === "composer" || e.origin.kind === "bridge";
    const orchestrating = typed && (await isOrchestrating($));
    if (!typed || (now === "off" && !orchestrating)) return next(e);
    const kind = (await kindOf($, e.text)) ?? "routine";
    if (now !== "off") {
      // A command's kind is explicit; a thin reply keeps the work's kind.
      const ran = commandKind(e.text) ? kind : carry(kind, lastKind, e.text);
      lastKind = ran;
      const p = pick(now, ran);
      if (await restoreSwitch($)) decided = true; // a reload kept the switch
      if (!decided) {
        decided = true;
        // An orchestrator keeps its model: handing work off is what makes it cheaper.
        if (!orchestrating) await askFirstModel($, p.model);
      }
      effort = p.effort;
      // A model weaker than the pick (kept from the first prompt) runs at the stretch effort.
      await escalate($, p.model);
      await showStatus($);
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
      // Auto picks the effort; with the profile off the band's effort holds, if one is set.
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
