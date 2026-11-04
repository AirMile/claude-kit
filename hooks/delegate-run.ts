import type { EngineInterface } from "claude-code";

import {
  type Author,
  type Family,
  type GeminiRoute,
  newest,
  parseModel,
  type Role,
  route,
  type Route,
} from "./delegate-policy";
import {
  changed,
  codexArgs,
  codexHint,
  gptOn,
  gptStatus,
  pins,
  type Run,
  runCodex,
  type GptStatus,
} from "./codex-run";
import { agyArgs, type AgyRun, runAgy } from "./agy-run";
import { balance } from "./balance";
import { flowDelegated } from "./flow";
import { REVIEW_MARK } from "./flow-evidence";
import {
  claudeMeters,
  noteClaudeLimits,
  noteGptMeters,
} from "./delegate-balance";

export const threads = new Map<string, Family>();
export const agyThreads = new Set<string>(); // conversation ids of Gemini runs this session
let writing = false; // a GPT run that writes is going: one at a time in this checkout

export function acquireWriter(): boolean {
  if (writing) return false;
  writing = true;
  return true;
}

export function releaseWriter(): void {
  writing = false;
}

const SHAPE =
  "Conclusion first; evidence as file:line; uncertainties. No command logs, " +
  "file contents beyond short quotes, or diffs.";
export const FOOTER: Record<Role, string> = {
  search: `Read only: change no files. Aim for 2000 characters or less. ${SHAPE}`,
  research: `Read only: change no files. Aim for 4000 characters or less. ${SHAPE}`,
  plan: `Read only: change no files. Aim for 4000 characters or less. ${SHAPE}`,
  review:
    "Read only: change no files. Review the uncommitted changes (git status, git diff, new " +
    "files too) against the brief above. List findings most severe first as [P0] to [P3] with " +
    `file:line and why; no fixes. No findings → say so. For this review, ${REVIEW_MARK} (fail = any [P0] or [P1]), ` +
    "then a line `failure-paths: <the failure paths and integration points you checked>`. " +
    `Aim for 4000 characters or less. ${SHAPE}`,
  build: `Follow the project's AGENTS.md. Commit, push and deploy nothing. Aim for 2000 characters or less. ${SHAPE} Include checks run and their results.`,
  "build+": `Follow the project's AGENTS.md. Commit, push and deploy nothing. Aim for 4000 characters or less. ${SHAPE} Include checks run and their results.`,
};

export type RoutingInput = {
  role: Role;
  author?: Author;
  family?: Family;
  thread?: string;
};
export type GptRoute = Extract<Route, { provider: "gpt" }> & { role: Role };
export type DelegationRoute =
  | Extract<Route, { provider: "none" }>
  | {
      provider: "claude";
      r: Extract<Route, { provider: "claude" }>;
      why: string;
    }
  | { provider: "unavailable"; reason: string }
  | { provider: "gpt"; r: GptRoute; argv: string[] };
export type DelegatedRun = {
  run: Run;
  files: string[];
  head: Pick<GptRoute, "name" | "sandbox" | "effort">;
};

export async function routeDelegation(
  $: EngineInterface,
  input: RoutingInput,
): Promise<DelegationRoute> {
  const on = await gptOn($);
  const family =
    input.family ?? (input.thread ? threads.get(input.thread) : undefined);
  // With GPT off, Codex is read only for a family the user named.
  const st: GptStatus =
    on || family
      ? await gptStatus($)
      : { argv: null, state: "missing", models: [], limits: {}, at: 0 };
  const now = await $.clock.now();
  const usage = await $.session.usage().catch(() => undefined);
  noteClaudeLimits(usage?.rateLimits ?? [], now);
  const claude = claudeMeters();
  const gpt = st.argv && !st.error ? st.limits : undefined;
  noteGptMeters(on, gpt, now, st.at);
  const r = route({
    role: input.role,
    author: input.author,
    family,
    band: balance(now).band,
    gptOn: on,
    models: newest(st.models, await pins($)),
    claude,
    gpt,
    now,
  });
  if (r.provider === "none") return r;
  if (r.provider === "claude")
    return {
      provider: "claude",
      r,
      why: !on
        ? "GPT is off in the band"
        : st.error
          ? `Codex: ${st.error}`
          : "Claude has the room or the role",
    };
  if (!st.argv)
    return {
      provider: "unavailable",
      reason: codexHint(st) ?? "Codex is not available here",
    };
  return { provider: "gpt", r: { ...r, role: input.role }, argv: st.argv };
}

export async function runDelegated(
  $: EngineInterface,
  r: GptRoute,
  argv: string[],
  brief: string,
  toolUseId: string,
  thread?: string,
  deadlineMs?: number,
): Promise<DelegatedRun> {
  const root = await $.session.root();
  const before = await changed($, root);
  let last = 0;
  const show = async (line: string) => {
    const t = await $.clock.now();
    if (t - last < 2000) return;
    last = t;
    try {
      $.ui.notice(toolUseId, `GPT ${r.name} · ${r.role} · ${line}`);
    } catch {
      // the call's dialog is gone: nothing to show it under
    }
  };
  let run: Run;
  try {
    run = await runCodex(
      $,
      [...argv, ...codexArgs(r, root, thread)],
      brief,
      root,
      show,
      deadlineMs,
    );
  } catch (err) {
    // Codex did not start, or its stream broke: say so rather than leave the call unanswered.
    run = {
      answer: "",
      commands: 0,
      error: `Codex did not run: ${String(err)}`,
    };
  } finally {
    void gptStatus($, true); // the ChatGPT meters moved
  }
  const familyRun = parseModel({ id: r.model })?.family;
  if (run.thread && familyRun) threads.set(run.thread, familyRun);
  const files = [...(await changed($, root))]
    .filter(([path, hash]) => before.get(path) !== hash)
    .map(([path]) => path);
  if (r.sandbox === "workspace-write") await flowDelegated($, files); // GPT's changes count
  return {
    run,
    files,
    head: { name: r.name, sandbox: r.sandbox, effort: r.effort },
  };
}

// One Gemini run through agy: the same before/after diff of the worktree as a GPT run, and a
// writing run counts as Gemini's change for flow.
export async function runGemini(
  $: EngineInterface,
  r: GeminiRoute,
  path: string,
  brief: string,
  toolUseId: string,
  role: Role,
  conversation?: string,
  deadlineMs?: number,
): Promise<{ run: AgyRun; files: string[] }> {
  const root = await $.session.root();
  const before = await changed($, root);
  let last = 0;
  const show = async (line: string) => {
    const t = await $.clock.now();
    if (t - last < 2000) return;
    last = t;
    try {
      $.ui.notice(toolUseId, `Gemini ${r.name} · ${role} · ${line}`);
    } catch {
      // the call's dialog is gone: nothing to show it under
    }
  };
  let run: AgyRun;
  try {
    run = await runAgy(
      $,
      agyArgs(path, r, root, brief, conversation),
      root,
      show,
      deadlineMs,
    );
  } catch (err) {
    run = { answer: "", error: `agy did not run: ${String(err)}` };
  }
  if (run.conversation) agyThreads.add(run.conversation);
  const files = [...(await changed($, root))]
    .filter(([p, hash]) => before.get(p) !== hash)
    .map(([p]) => p);
  if (r.writes) await flowDelegated($, files, "gemini");
  return { run, files };
}
