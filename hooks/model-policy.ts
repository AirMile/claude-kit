// Which model and effort a prompt or subagent gets (auto-model.ts applies it). Pure: no `$`.
// A prompt is sorted into one of four kinds of work; the profile the user picked (the band's
// buttons, /mode) maps each kind to a model and an effort.

export type Kind = "question" | "routine" | "planning" | "heavy";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Profile = "lean" | "balanced" | "quality";
export type Mode = Profile | "off";
export type Pick = { model: string; effort: Effort };

export const PROFILES: readonly Profile[] = ["lean", "balanced", "quality"];
// Effort levels, lowest first; the engine lowers one the running model lacks.
export const EFFORTS: readonly Effort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
export const isEffort = (v: unknown): v is Effort =>
  EFFORTS.includes(v as Effort);
export const DEFAULT_MODE: Profile = "balanced";

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";

// Every model the engine can switch to, cheapest first. No Fable: the user's Pro plan lacks it.
export const MODELS: readonly string[] = [HAIKU, SONNET, OPUS];

const TABLE: Record<Profile, Record<Kind, Pick>> = {
  lean: {
    question: { model: HAIKU, effort: "low" },
    routine: { model: SONNET, effort: "medium" },
    planning: { model: OPUS, effort: "high" },
    heavy: { model: OPUS, effort: "high" },
  },
  balanced: {
    question: { model: HAIKU, effort: "low" },
    routine: { model: SONNET, effort: "medium" },
    planning: { model: OPUS, effort: "high" },
    heavy: { model: OPUS, effort: "xhigh" },
  },
  quality: {
    question: { model: SONNET, effort: "medium" },
    routine: { model: OPUS, effort: "high" },
    planning: { model: OPUS, effort: "high" },
    heavy: { model: OPUS, effort: "xhigh" },
  },
};

export const pick = (profile: Profile, kind: Kind): Pick =>
  TABLE[profile][kind];

// The classifier sees only these labels, so each says what it covers.
export const LABELS: Record<Kind, string> = {
  question:
    "question: explain, look something up, a short question or a one-line change",
  routine: "routine: write or change ordinary code, fix a clear bug, styling",
  planning:
    "planning: design, architecture, a plan, a review, weighing options",
  heavy: "heavy: large refactor, a stuck or hard bug, a long multi-step build",
};

export function kindOfLabel(label: string | undefined): Kind | undefined {
  return (Object.keys(LABELS) as Kind[]).find((k) => LABELS[k] === label);
}

// kit's own skills need no classifier: their work is known. `build` works from a spec with
// acceptance criteria and a verifier that reads it afresh, so it needs no more than planning:
// xhigh costs about twice high on Opus for little gain (see README, Model and effort).
const COMMANDS: Record<string, Kind> = {
  build: "planning",
  product: "planning",
  seo: "planning",
  theme: "planning",
  improve: "planning",
  commit: "question",
  explain: "question",
  lessons: "question",
};

// `/build x`, `/kit:build x`, or an expanded skill's `<command-name>/kit:build</command-name>`.
export function commandKind(text: string): Kind | undefined {
  const m =
    /^\s*\/([\w:-]+)/.exec(text) ??
    /<command-name>\/?([\w:-]+)<\/command-name>/.exec(text);
  const name = m?.[1]?.replace(/^kit:/, "");
  return name ? COMMANDS[name] : undefined;
}

// Subagents whose work is known by their type; others are classified on their prompt. The
// verifier is a review where edge cases decide the result, so it runs at high in every profile.
const AGENTS: Record<string, Kind> = {
  Explore: "question",
  "kit:verifier": "planning",
};

// A subagent's effort: the profile's pick, unless its Agent call asked for one (that call wins).
export const subagentEffort = (
  asked: Effort | undefined,
  picked: Effort,
): Effort | undefined => (asked ? undefined : picked);

// Kinds of work, lightest first.
const RANK: Record<Kind, number> = {
  question: 0,
  routine: 1,
  planning: 2,
  heavy: 3,
};
export const THIN_CHARS = 30;

// A reply such as "ja" or "doe maar" holds no task, so it would be sorted as the lightest work
// in the middle of heavy work. Thin: short, and not a question.
export const isThin = (text: string): boolean =>
  text.trim().length <= THIN_CHARS && !text.includes("?");

// The kind a prompt runs as: a thin one never lowers the work it continues (`last`).
export function carry(kind: Kind, last: Kind | undefined, text: string): Kind {
  return last && isThin(text) && RANK[last] > RANK[kind] ? last : kind;
}

export const agentKind = (type: string): Kind | undefined => AGENTS[type];

// The family a model id or alias belongs to: `claude-opus-5-5[1m]` and `opus` are both opus.
export function family(model: string): string | undefined {
  return /(haiku|sonnet|opus|fable|mythos)/i.exec(model)?.[1]?.toLowerCase();
}

// Model tiers, weakest first: how far the model a prompt needs is above the one running.
const TIERS = ["haiku", "sonnet", "opus"];

// Below this share of the context window a switch costs little: the new model reads the whole
// conversation again without the cache, so a fuller chat is offered a clear or compact first.
export const SWITCH_NOW_BELOW = 30;

export type Escalation =
  | { step: "none" }
  | { step: "effort"; effort: Effort }
  | { step: "ask"; want: string; switchNow: boolean };

// The effort a model runs at when the prompt needs a stronger one. Not `max`: it costs up to 3 times
// xhigh and scores no better on coding. Haiku stops at high: its xhigh can end a turn with no
// visible answer.
export const stretch = (running: string): Effort =>
  family(running) === "haiku" ? "high" : "xhigh";

// What a prompt that needs `want` does on `running`: nothing at or above it, the stretch effort
// one tier short (the engine lowers a level the model lacks), further short a question.
export function escalation(
  running: string,
  want: string,
  contextPercent: number | undefined,
): Escalation {
  const have = TIERS.indexOf(family(running) ?? "");
  const need = TIERS.indexOf(family(want) ?? "");
  if (have < 0 || need <= have) return { step: "none" };
  if (need - have === 1) return { step: "effort", effort: stretch(running) };
  const switchNow =
    contextPercent !== undefined && contextPercent < SWITCH_NOW_BELOW;
  return { step: "ask", want, switchNow };
}

// A model switch, kept in $.store per session id so a mod reload or restart keeps it.
export type Switch = { chosen: string; base: string };
const MAX_SWITCHES = 20;

function switches(stored: unknown): Record<string, Switch> {
  const out: Record<string, Switch> = {};
  if (!stored || typeof stored !== "object") return out;
  for (const [id, v] of Object.entries(stored)) {
    const s = v as Partial<Switch> | null;
    if (typeof s?.chosen === "string" && typeof s.base === "string")
      out[id] = { chosen: s.chosen, base: s.base };
  }
  return out;
}

export const switchOf = (stored: unknown, id: string): Switch | undefined =>
  switches(stored)[id];

// The stored map with this session's switch set (or dropped), the newest MAX_SWITCHES kept.
export function withSwitch(
  stored: unknown,
  id: string,
  s: Switch | undefined,
): Record<string, Switch> {
  const all = switches(stored);
  delete all[id];
  if (s) all[id] = s;
  return Object.fromEntries(Object.entries(all).slice(-MAX_SWITCHES));
}

// What the status line and the question call a model: `claude-opus-5-5` → `Opus 5.5`.
export function displayName(model: string): string {
  const m = /(haiku|sonnet|opus|fable|mythos)-(\d+)(?:-(\d+))?/i.exec(model);
  if (!m?.[1] || !m[2]) return model;
  const name = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return `${name} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

export const isMode = (v: unknown): v is Mode =>
  v === "off" || PROFILES.includes(v as Profile);

export const profileName = (mode: Mode): string =>
  mode.charAt(0).toUpperCase() + mode.slice(1);

// The band's run line: `Opus 5.5 · medium`, the effort left out before the first prompt.
export const runLine = (model: string, effort: string | undefined): string =>
  [displayName(model), effort].filter(Boolean).join(" · ");
