import type { Effort } from "./model-policy";

// Where a delegated piece of work runs: Claude (Haiku, Sonnet, Opus as a subagent) or GPT
// through Codex (Luna, Terra, Sol), by its role and by which plan has room. Pure: delegate.ts
// feeds it the meters and Codex's catalog. GPT models are named by family and the newest
// version wins, so a new release is used without a code change; a family never stands in for
// another (Sol never becomes Astra), and Astra runs only when asked for by name. With the band's
// GPT switch off, only a family asked for by name runs on GPT.

export type Role =
  "search" | "research" | "build" | "build+" | "review" | "plan";
export const ROLES: readonly Role[] = [
  "search",
  "research",
  "build",
  "build+",
  "review",
  "plan",
];
export type Family = "sol" | "terra" | "luna" | "astra";
export const FAMILIES: readonly Family[] = ["sol", "terra", "luna", "astra"];
export type Author = "claude" | "gpt";
export type Sandbox = "read-only" | "workspace-write";

export type CatalogModel = { id: string; name?: string; description?: string };
export type GptModel = {
  id: string;
  family: Family;
  version: number[];
  name: string;
};
export type Window = { pct: number; resetsAt?: string };
export type Meters = { five_hour?: Window; seven_day?: Window };

export type Route =
  | {
      provider: "gpt";
      model: string;
      name: string;
      effort: Effort;
      sandbox: Sandbox;
      review: boolean; // `codex review` of the uncommitted changes
    }
  | {
      provider: "claude";
      model: "haiku" | "sonnet" | "opus";
      effort: Effort;
      subagentType: "Explore" | "general-purpose";
      writes: boolean;
    }
  | { provider: "none"; reason: string };

const ID = /^gpt-(\d+(?:\.\d+)*)-([a-z]+)$/;

export function parseModel(m: CatalogModel): GptModel | undefined {
  const hit = ID.exec(m.id);
  const family = hit?.[2] as Family | undefined;
  if (!hit?.[1] || !family || !FAMILIES.includes(family)) return undefined;
  const name = `${family.charAt(0).toUpperCase()}${family.slice(1)} ${hit[1]}`;
  return { id: m.id, family, version: hit[1].split(".").map(Number), name };
}

const newer = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
};

// Per family the newest version in the catalog, or the pinned id while the catalog has it.
export function newest(
  catalog: readonly CatalogModel[],
  pins: Partial<Record<Family, string>> = {},
): Partial<Record<Family, GptModel>> {
  const out: Partial<Record<Family, GptModel>> = {};
  const models = catalog.map(parseModel).filter((m) => m !== undefined);
  for (const m of models) {
    const have = out[m.family];
    if (!have || newer(m.version, have.version)) out[m.family] = m;
  }
  for (const m of models) if (pins[m.family] === m.id) out[m.family] = m;
  return out;
}

const HOUR = 3_600_000;
const SPAN: Record<keyof Meters, number> = {
  five_hour: 5 * HOUR,
  seven_day: 168 * HOUR,
};

// How far a window's use runs ahead of the time gone by in it, in points: 40% used two days
// into seven is about 11 ahead.
export function ahead(
  w: Window | undefined,
  kind: keyof Meters,
  now: number,
): number {
  if (!w?.resetsAt) return 0;
  const left = Math.max(0, Date.parse(w.resetsAt) - now);
  const gone = Math.min(1, Math.max(0, 1 - left / SPAN[kind]));
  return w.pct - gone * 100;
}

export const CLAUDE_TIGHT = { five_hour: 70, ahead: 10 } as const;
export const GPT_TIGHT = { five_hour: 80, seven_day: 90 } as const;

export const claudeTight = (m: Meters, now: number): boolean =>
  (m.five_hour?.pct ?? 0) >= CLAUDE_TIGHT.five_hour ||
  ahead(m.seven_day, "seven_day", now) >= CLAUDE_TIGHT.ahead;

export const gptTight = (m: Meters): boolean =>
  (m.five_hour?.pct ?? 0) >= GPT_TIGHT.five_hour ||
  (m.seven_day?.pct ?? 0) >= GPT_TIGHT.seven_day;

type GptPick = { family: Family; effort: Effort; writes: boolean };
type ClaudePick = Omit<Extract<Route, { provider: "claude" }>, "provider">;

const GPT: Record<Role, GptPick> = {
  search: { family: "luna", effort: "low", writes: false },
  research: { family: "sol", effort: "medium", writes: false },
  build: { family: "terra", effort: "medium", writes: true },
  "build+": { family: "sol", effort: "high", writes: true },
  review: { family: "sol", effort: "high", writes: false },
  plan: { family: "sol", effort: "high", writes: false },
};

// Without GPT a change is built here: a Claude subagent would start cold on what this chat
// already knows. A blind plan from the same family adds little next to this chat's own.
const CLAUDE: Record<Role, ClaudePick | undefined> = {
  search: {
    model: "haiku",
    effort: "low",
    subagentType: "Explore",
    writes: false,
  },
  research: {
    model: "sonnet",
    effort: "medium",
    subagentType: "general-purpose",
    writes: false,
  },
  build: undefined,
  "build+": undefined,
  review: {
    model: "sonnet",
    effort: "high",
    subagentType: "general-purpose",
    writes: false,
  },
  plan: undefined,
};

function onClaude(role: Role, why: string): Route {
  const pick = CLAUDE[role];
  return pick
    ? { provider: "claude", ...pick }
    : { provider: "none", reason: why };
}

function onGpt(role: Role, m: GptModel): Route {
  const { effort, writes } = GPT[role];
  return {
    provider: "gpt",
    model: m.id,
    name: m.name,
    effort,
    sandbox: writes ? "workspace-write" : "read-only",
    review: role === "review",
  };
}

export type RouteInput = {
  role: Role;
  author?: Author; // who wrote what a review looks at; this chat (Claude) when absent
  family?: Family; // asked for by name: it wins
  gptOn: boolean; // the band's GPT switch
  models: Partial<Record<Family, GptModel>>;
  claude: Meters;
  gpt: Meters | undefined; // undefined: Codex is missing or not logged in
  now: number;
};

export function route(i: RouteInput): Route {
  if (i.family) {
    const m = i.models[i.family];
    return m
      ? onGpt(i.role, m)
      : { provider: "none", reason: `no ${i.family} model in Codex's catalog: do it here` };
  }
  const want = i.models[GPT[i.role].family];
  const gptOk =
    i.gptOn && i.gpt !== undefined && !gptTight(i.gpt) && want;
  if (i.role === "review" && i.author === "gpt")
    return onClaude("review", "a review needs another family");
  if (!gptOk) {
    const why = !i.gptOn
      ? "GPT is off in the band"
      : i.gpt === undefined
        ? "Codex is not available here"
        : "ChatGPT has no room or no model for this";
    // Claude's own code is covered by its checks and the verifier: no second Claude review.
    if (i.role === "review")
      return { provider: "none", reason: `${why}; the checks and the verifier cover it` };
    return onClaude(i.role, `${why}: ${i.role === "plan" ? "plan" : "build it"} here`);
  }
  // Searching is quick and cheap on Haiku; GPT takes it only while Claude's plan is tight.
  if (i.role === "search" && !claudeTight(i.claude, i.now))
    return onClaude("search", "");
  return onGpt(i.role, want);
}
