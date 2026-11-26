import { gptRefusal, runCost, shareRefusal } from "./gpt-limits";
import type { Effort, Plan } from "./model-policy";

// Where a delegated piece of work runs: Claude, or GPT through Codex. GPT always takes what only
// another model family can give: a review of this chat's work and a blind second plan (Sol; Astra
// for the riskiest review), and any role on a model the user names. On Claude Pro it also takes
// searching (Luna), research (Sol) and building (Terra, Sol) while ChatGPT has its share of room,
// to spare Claude's limits; on Max those stay on Claude. Pure: delegate.ts feeds it ChatGPT's meters and Codex's catalog. GPT models are
// named by family and the newest version wins, so a new release is used without a code change; a
// family never stands in for another by version. With the band's GPT switch off, only a family
// asked for by name runs on GPT.

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
export type Author = "claude" | "gpt" | "gemini";
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
      model: "sonnet" | "opus" | "fable";
      effort: Effort;
      subagentType: "Explore" | "general-purpose";
      writes: boolean;
      why: string;
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

// Roles where another family is worth a run of its own.
export const OTHER_FAMILY: readonly Role[] = ["review", "plan"];
const WRITE_ROLES: readonly Role[] = ["build", "build+"];

type GptPick = { effort: Effort; writes: boolean };
type ClaudePick = Omit<
  Extract<Route, { provider: "claude" }>,
  "provider" | "why"
>;

const GPT: Record<Role, GptPick> = {
  search: { effort: "low", writes: false },
  research: { effort: "medium", writes: false },
  build: { effort: "medium", writes: true },
  "build+": { effort: "high", writes: true },
  review: { effort: "high", writes: false },
  plan: { effort: "high", writes: false },
};

// A change is made here: a Claude subagent would start cold on what this chat already knows. A
// blind plan from the same family adds little next to this chat's own.
const CLAUDE: Record<Role, ClaudePick | undefined> = {
  search: {
    model: "sonnet",
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
    ? { provider: "claude", ...pick, why }
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
  strict?: boolean; // a named family must fit the limits too (run_task: it writes)
  continues?: Family; // a follow-up on a run kit picked the model for
  risky?: boolean; // a V3 task's review: Astra when it fits, and only another family
  gptOn: boolean; // the band's GPT switch
  models: Partial<Record<Family, GptModel>>;
  gpt: Meters | undefined; // undefined: Codex is missing or not logged in
  plan?: Plan; // the Claude plan; Max when absent
  claude?: Meters; // Claude's windows, weighed against ChatGPT's on Pro
  now: number;
};

// A fresh Claude reviewer on the plan's strongest model (Fable bills extra on Pro).
function reviewer(i: RouteInput, why: string): Route {
  const picked = onClaude("review", why);
  return picked.provider === "claude"
    ? { ...picked, model: i.plan === "pro" ? "opus" : "fable" }
    : picked;
}

// The model GPT takes shared work on; reviews and plans run on Sol.
const SHARED: Record<Role, Family> = {
  search: "luna",
  research: "sol",
  build: "terra",
  "build+": "sol",
  review: "sol",
  plan: "sol",
};

// Work Claude could do too, on Pro: GPT's while its share has room.
function shared(i: RouteInput, here: string): Route {
  const family = i.continues ?? SHARED[i.role];
  const want = i.models[family];
  const refused = !i.gptOn
    ? "GPT is off in the band"
    : i.gpt === undefined
      ? "Codex is not available here"
      : shareRefusal(i.gpt, i.claude ?? {}, i.now, runCost(i.role, family));
  if (!refused && want) return onGpt(i.role, want);
  return onClaude(
    i.role,
    `${refused ?? `no ${family} model in Codex's catalog`}: ${here}`,
  );
}

export function route(i: RouteInput): Route {
  const full = (family: Family) =>
    i.gpt && gptRefusal(i.gpt, i.now, runCost(i.role, family));
  if (i.family) {
    const m = i.models[i.family];
    if (!m)
      return {
        provider: "none",
        reason: `no ${i.family} model in Codex's catalog: do it here`,
      };
    const unread = !i.gpt?.five_hour && !i.gpt?.seven_day;
    const why = !i.strict
      ? undefined
      : unread
        ? "ChatGPT's limits could not be read"
        : full(i.family);
    return why
      ? { provider: "none", reason: `${why}: do it here` }
      : onGpt(i.role, m);
  }
  if (i.role === "review" && i.author === "gpt")
    return reviewer(i, "a review needs another family");
  // A follow-up that writes is a build: GPT's only where it shares the work.
  const writes = WRITE_ROLES.includes(i.role);
  // On Pro a follow-up of shared work stays within the share (shared() below).
  const other =
    OTHER_FAMILY.includes(i.role) ||
    (i.plan !== "pro" && i.continues !== undefined && !writes);
  const here = i.role === "plan" ? "plan here" : "do it here";
  if (!other)
    return i.plan === "pro"
      ? shared(i, here)
      : onClaude(
          i.role,
          `Claude does this itself; GPT is for a review, a second plan or a model you name: ${here}`,
        );
  const fits = (f: Family) => i.models[f] !== undefined && !full(f);
  const family =
    i.continues ?? (i.risky && fits("astra") ? "astra" : "sol");
  const want = i.models[family];
  const unread = i.gpt && !i.gpt.five_hour && !i.gpt.seven_day;
  const refused = unread ? "ChatGPT's limits could not be read" : full(family);
  if (i.gptOn && i.gpt !== undefined && !refused && want)
    return onGpt(i.role, want);
  const why = !i.gptOn
    ? "GPT is off in the band"
    : i.gpt === undefined
      ? "Codex is not available here"
      : (refused ?? `no ${family} model in Codex's catalog`);
  if (i.role === "review") {
    // Risky work takes no Claude review of Claude's code, so it stays open.
    return i.risky
      ? {
          provider: "none",
          reason: `${why}; a V3 task needs another family: it stays open until it has a review or the user waives it`,
        }
      : reviewer(i, `${why}: a fresh Claude reviewer stands in`);
  }
  return onClaude(i.role, `${why}: ${here}`);
}

// Gemini through the Antigravity CLI (agy): only on request (provider "gemini"), never by the
// band: agy shows no meters, so there is nothing to balance. Ids read `gemini-<version>-<family>-
// <effort>`; the newest version of the asked family wins, Hydrogen when none is named, and the
// other models agy lists (Claude, GPT-OSS) are never picked.
export type Provider = "gpt" | "gemini";
export const PROVIDERS: readonly Provider[] = ["gpt", "gemini"];
export type GeminiFamily = "hydrogen" | "flash" | "pro";
export const GEMINI_FAMILIES: readonly GeminiFamily[] = [
  "hydrogen",
  "flash",
  "pro",
];
export type GeminiEffort = "high" | "medium" | "low";

export type GeminiRoute = {
  provider: "gemini";
  model: string;
  name: string;
  effort: GeminiEffort;
  writes: boolean;
};

const GEMINI_ID = /^gemini-(\d+(?:\.\d+)*)-([a-z]+)-(high|medium|low)$/;
const GEMINI_EFFORT: Record<Role, GeminiEffort> = {
  search: "low",
  research: "high",
  plan: "high",
  review: "high",
  build: "medium",
  "build+": "high",
};

export function geminiRoute(
  role: Role,
  ids: string[],
  family: GeminiFamily = "hydrogen",
): GeminiRoute | { provider: "none"; reason: string } {
  const effort = GEMINI_EFFORT[role];
  let best: { id: string; version: number[] } | undefined;
  for (const id of ids) {
    const hit = GEMINI_ID.exec(id);
    if (!hit?.[1] || hit[2] !== family || hit[3] !== effort) continue;
    const version = hit[1].split(".").map(Number);
    if (!best || newer(version, best.version)) best = { id, version };
  }
  if (!best)
    return {
      provider: "none",
      reason: `no ${family} model at ${effort} effort in agy's list: do it here`,
    };
  const name = `Gemini ${best.version.join(".")} ${family.charAt(0).toUpperCase()}${family.slice(1)}`;
  return {
    provider: "gemini",
    model: best.id,
    name,
    effort,
    writes: role === "build" || role === "build+",
  };
}

// `agy models` prints a banner line, then `<id>\t<name>` per model.
export function parseAgyModels(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.split("\t")[0]?.trim() ?? "")
    .filter((id) => GEMINI_ID.test(id));
}

// agy reads the prompt only from the flag's own value, so a brief has a ceiling (argv limits).
export const AGY_MAX_BRIEF = 200_000;

// The "Changed:" lines of a delegate answer. A read-only run changed nothing by definition: a
// working tree that differs afterwards is someone else's edit (the user, a hook, another run).
export function changedLines(writes: boolean, files: string[]): string {
  if (writes)
    return files.length ? `Changed: ${files.join(", ")}` : "Changed: nothing";
  return files.length
    ? `Changed: nothing (read-only run)\nChanged meanwhile, not by this run: ${files.join(", ")}`
    : "Changed: nothing (read-only run)";
}
