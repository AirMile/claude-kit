// Which model and effort a prompt or subagent gets (auto-model.ts applies it). Pure: no `$`.
// A prompt is sorted into one of four kinds of work; the profile the user picked (the band's
// buttons, /mode) maps each kind to a model and an effort.

export type Kind = "question" | "routine" | "planning" | "heavy";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Profile = "lean" | "balanced" | "quality";
export type Mode = Profile | "off";
export type Pick = { model: string; effort: Effort };

export const PROFILES: readonly Profile[] = ["lean", "balanced", "quality"];
export const DEFAULT_MODE: Profile = "balanced";

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";
const FABLE = "claude-fable-5-1";

// Every model the engine can switch to, cheapest first.
export const MODELS: readonly string[] = [HAIKU, SONNET, OPUS, FABLE];

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
    planning: { model: FABLE, effort: "high" },
    heavy: { model: FABLE, effort: "xhigh" },
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

// kit's own skills need no classifier: their work is known.
const COMMANDS: Record<string, Kind> = {
  build: "heavy",
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

// Subagents whose work is known by their type; others are classified on their prompt.
const AGENTS: Record<string, Kind> = {
  Explore: "question",
  "kit:verifier": "routine",
};

export const agentKind = (type: string): Kind | undefined => AGENTS[type];

// The family a model id or alias belongs to: `claude-opus-5-5[1m]` and `opus` are both opus.
export function family(model: string): string | undefined {
  return /(haiku|sonnet|opus|fable|mythos)/i.exec(model)?.[1]?.toLowerCase();
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
