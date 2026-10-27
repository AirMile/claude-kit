import type { EngineInterface } from "claude-code";

import type { Kind } from "./model-policy";

// Orchestrate, the band's ⑂ (off by default, kept in $.store): each typed prompt carries a note
// on where its work belongs, by the kind auto-model.ts sorted it into. This chat stays the
// orchestrator. `claude` hands self-contained, read-heavy or parallel work to subagents or, on
// the desktop app, its own session. `codex` hands it to Codex instead, which runs on the user's
// ChatGPT plan and so spares this plan's limits: research read-only, a change workspace-write,
// while this chat plans, reviews the diff and verifies. Once this plan's 5h or 7d meter reaches
// PRESSURE, routine changes go to Codex too. Handing off is not free (the other side starts cold
// and reads again, and its report and diff are read here), so a question gets no note and every
// note says when to keep the work here.

export type Orchestrate = "off" | "claude" | "codex";
export const ORCHESTRATES: readonly Orchestrate[] = ["off", "claude", "codex"];

// A name from the model table in the kit:codex skill, which maps it to a model id.
export const CODEX = "Sol 6.1";
export const PRESSURE = 70; // % of this plan's 5h or 7d limit used

const STORE_KEY = "orchestrate";
let how: Orchestrate | undefined; // read from $.store on first use

// Before Codex, the store held `true` for what is now `claude`.
const stored = (value: unknown): Orchestrate =>
  value === true
    ? "claude"
    : ORCHESTRATES.includes(value as Orchestrate)
      ? (value as Orchestrate)
      : "off";

export async function orchestration($: EngineInterface): Promise<Orchestrate> {
  if (how === undefined)
    how = stored(await $.store.get(STORE_KEY).catch(() => undefined));
  return how;
}

export async function isOrchestrating($: EngineInterface): Promise<boolean> {
  return (await orchestration($)) !== "off";
}

export async function setOrchestration($: EngineInterface, next: Orchestrate) {
  how = next;
  await $.store.set(STORE_KEY, next).catch(() => {});
}

const KEEP =
  "Keep work in this chat when it depends on what was discussed here, is small, or needs the " +
  "user's answers; hand it off when it stands alone, reads many files, or can run in parallel.";

const CLAUDE: Record<Kind, string | undefined> = {
  question: undefined,
  routine:
    "kit orchestrate: do this here, unless it means searching many files: then send an " +
    `Explore subagent and keep only its conclusion. ${KEEP}`,
  planning:
    "kit orchestrate: send the research (reading code, docs, weighing options) to subagents " +
    `and keep the decision and the plan in this chat. ${KEEP}`,
  heavy:
    "kit orchestrate: split this into independent pieces; give each to a subagent, or on the " +
    "desktop app its own session, and use this chat to coordinate, merge and verify the " +
    `results. ${KEEP}`,
};

// How a Codex run goes lives in the kit:codex skill (it ships with the plugin, so every device
// has it); the note only names the model and what this mode allows.
const RUN =
  `Run Codex with the kit:codex skill, model ${CODEX}: read-only for research, ` +
  "workspace-write for a change (this mode is the user's standing request for that). Read " +
  "only its final message, then review its diff and run the checks yourself. If Codex fails, " +
  "say why and do it here.";

const CODEX_NOTES: Record<Kind, ((used: number) => string) | undefined> = {
  question: undefined,
  routine: (used) =>
    used >= PRESSURE
      ? `kit orchestrate (Codex; this plan's limit is at ${used}%): give this change to Codex ` +
        "unless it is a few lines, and a search across many files to Codex read-only."
      : "kit orchestrate (Codex): do this here when it is small; a change across several files " +
        "that you can describe up front goes to Codex, a search across many files to an " +
        "Explore subagent.",
  planning: () =>
    "kit orchestrate (Codex): send the research (reading code, docs, weighing options) to Codex " +
    "read-only and keep the decision and the plan here; once the plan is settled, Codex can " +
    "carry out the change.",
  heavy: () =>
    "kit orchestrate (Codex): plan this here and split it into pieces that each stand alone; " +
    "give each to Codex, one at a time unless their files are apart, and use this chat to " +
    "brief, review the diffs and verify.",
};

// `used`: the higher of this plan's 5h and 7d meters, in %.
export function orchestrateNote(
  kind: Kind,
  to: Exclude<Orchestrate, "off">,
  used = 0,
): string | undefined {
  if (to === "claude") return CLAUDE[kind];
  const note = CODEX_NOTES[kind]?.(Math.round(used));
  return note && `${note} ${KEEP} ${RUN}`;
}

export async function limitsUsed($: EngineInterface): Promise<number> {
  const usage = await $.session.usage().catch(() => undefined);
  return Math.max(
    0,
    ...(usage?.rateLimits ?? [])
      .filter((r) => r.kind === "five_hour" || r.kind === "seven_day")
      .map((r) => r.percentUsed),
  );
}
