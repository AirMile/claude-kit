import type { EngineInterface } from "claude-code";

import {
  isPlanChoice,
  type Plan,
  type PlanChoice,
  planOfConfig,
  PLAN_CHOICES,
} from "./model-policy";

// The Claude plan that bounds the profile's models (model-policy.ts): read from the login's
// global config on "auto", or set by hand with `/mode plan`. The choice is kept in $.store
// across sessions; what was read is kept until the next chat.

const STORE_KEY = "plan";

let choice: PlanChoice | undefined; // read from $.store on first use
let detected: Plan | undefined; // read from the config once per chat
let unread = false; // that read found no config: Pro by default, said by planName

export async function getPlanChoice($: EngineInterface): Promise<PlanChoice> {
  if (choice === undefined) {
    const stored = await $.store.get(STORE_KEY).catch(() => undefined);
    choice = isPlanChoice(stored) ? stored : "auto";
  }
  return choice;
}

async function detect($: EngineInterface): Promise<Plan> {
  unread = false;
  try {
    const dir = await $.env.get("CLAUDE_CONFIG_DIR");
    const home =
      dir || (await $.env.get("HOME")) || (await $.env.get("USERPROFILE"));
    if (home)
      return planOfConfig(String(await $.fs.read(`${home}/.claude.json`)));
  } catch {
    // missing, unreadable or over the read limit
  }
  unread = true;
  return "pro";
}

export async function getPlan($: EngineInterface): Promise<Plan> {
  const set = await getPlanChoice($);
  if (set !== "auto") return set;
  detected ??= await detect($);
  return detected;
}

// A new chat reads the config again: the login may have changed.
export function forgetPlan() {
  detected = undefined;
}

export async function planName($: EngineInterface): Promise<string> {
  const plan = (await getPlan($)) === "max" ? "Max" : "Pro";
  if ((await getPlanChoice($)) !== "auto") return plan;
  return unread ? `${plan} (auto, login config not read)` : `${plan} (auto)`;
}

// `/mode plan [auto|pro|max]`: sets the choice, or says the plan in use.
export async function planCommand(
  $: EngineInterface,
  arg: string,
): Promise<string> {
  if (isPlanChoice(arg)) {
    choice = arg;
    detected = undefined;
    await $.store.set(STORE_KEY, arg).catch(() => {});
    $.ui.invalidate("ui.render");
    return `kit plan: ${await planName($)}.`;
  }
  return `kit plan: ${await planName($)}. Pick one: /mode plan ${PLAN_CHOICES.join("|")}`;
}
