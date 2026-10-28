import type { EngineInterface, On, ToolSpec } from "claude-code";

import {
  type Author,
  type Family,
  FAMILIES,
  newest,
  parseModel,
  type Role,
  ROLES,
  route,
  type Route,
} from "./delegate-policy";
import {
  changed,
  codexArgs,
  gptOn,
  gptStatus,
  pins,
  type Run,
  runCodex,
  type GptStatus,
} from "./codex-run";
import { balance } from "./balance";
import { gptCommandRun } from "./gpt-command";
import { flowDelegated } from "./flow";
import {
  claudeMeters,
  noteClaudeLimits,
  noteGptMeters,
} from "./delegate-balance";

export { gptCommand } from "./gpt-command";

// mcp__kit__delegate: this chat hands a self-contained piece of work to whichever plan has room
// (delegate-policy.ts picks Claude or GPT, and the model). A GPT route runs here through the
// Codex CLI and returns only Codex's final message and the files that changed: its whole run
// (every command and its output) stays in Codex's own session file. A Claude route returns how
// to run it with the Agent tool (a mod could start it and read its answer from turn.complete;
// not done yet). The Codex side
// (its catalog, the ChatGPT meters, a run) is codex-run.ts.

const TOOL = "mcp__kit__delegate";
const MAX_ANSWER = 6000;
const WRITES: readonly Role[] = ["build", "build+"];

export const delegateTool: ToolSpec = {
  name: "delegate",
  description:
    "kit: hand a self-contained piece of work to Claude (a subagent) or GPT (Codex), on " +
    "whichever plan has room and the newest model for its role. Roles: search (find code), " +
    "research (read and weigh, read-only), build (a change you can describe up front), build+ " +
    "(a hard change), review (the uncommitted changes; author: who wrote them), plan (a blind " +
    "second plan: never include your own). The brief stands alone: goal, constraints, files, " +
    "checks to run. family: a GPT model the user asked for by name (sol, terra, luna, astra). " +
    "A brief states the decision you need, facts already known, files in scope and when to stop. " +
    "thread: continue an earlier GPT run with a follow-up brief. A GPT run returns its final " +
    "message and changed files; review its diff and run the checks yourself. A Claude route " +
    "says how to run it with the Agent tool.",
  inputSchema: {
    type: "object",
    properties: {
      role: { type: "string", enum: [...ROLES] },
      brief: { type: "string" },
      author: { type: "string", enum: ["claude", "gpt"] },
      family: { type: "string", enum: [...FAMILIES] },
      thread: { type: "string" },
    },
    required: ["role", "brief"],
  },
};

const threads = new Map<string, Family>();
let writing = false; // a GPT run that writes is going: one at a time in this checkout

type Input = {
  role: Role;
  brief: string;
  author?: Author;
  family?: Family;
  thread?: string;
};

function readInput(e: unknown): Input | string {
  const i = e as Record<string, unknown>;
  const role = i.role as Role;
  if (!ROLES.includes(role))
    return `Not run: role must be one of ${ROLES.join(", ")}.`;
  if (typeof i.brief !== "string" || !i.brief.trim())
    return "Not run: the brief is empty.";
  const family = FAMILIES.includes(i.family as Family)
    ? (i.family as Family)
    : undefined;
  const author =
    i.author === "gpt" || i.author === "claude" ? i.author : undefined;
  const thread =
    typeof i.thread === "string" && i.thread ? i.thread : undefined;
  return { role, brief: i.brief, author, family, thread };
}

const SHAPE =
  "Conclusion first; evidence as file:line; uncertainties. No command logs, " +
  "file contents beyond short quotes, or diffs.";
const FOOTER: Record<Role, string> = {
  search: `Read only: change no files. Aim for 2000 characters or less. ${SHAPE}`,
  research: `Read only: change no files. Aim for 4000 characters or less. ${SHAPE}`,
  plan: `Read only: change no files. Aim for 4000 characters or less. ${SHAPE}`,
  review:
    "Read only: change no files. Review the uncommitted changes (git status, git diff, new " +
    "files too) against the brief above. List findings most severe first as [P0] to [P3] with " +
    `file:line and why; no fixes. No findings → say so. Aim for 4000 characters or less. ${SHAPE}`,
  build: `Follow the project's AGENTS.md. Commit, push and deploy nothing. Aim for 2000 characters or less. ${SHAPE} Include checks run and their results.`,
  "build+": `Follow the project's AGENTS.md. Commit, push and deploy nothing. Aim for 4000 characters or less. ${SHAPE} Include checks run and their results.`,
};

function claudeAnswer(
  r: Extract<Route, { provider: "claude" }>,
  why: string,
  role: Role,
): string {
  const ro = r.writes ? "" : ", read-only: it edits nothing";
  return (
    `Route: Claude (${why}). Run the brief with the Agent tool: subagent_type ` +
    `"${r.subagentType}", model "${r.model}", effort "${r.effort}"${ro}. Then check its ` +
    `result here before you rely on it. Add to the subagent prompt: "${FOOTER[role]}"`
  );
}

async function delegate(
  $: EngineInterface,
  input: Input,
  toolUseId: string,
): Promise<string> {
  const on = await gptOn($);
  const family = input.family ?? (input.thread ? threads.get(input.thread) : undefined);
  // With GPT off, Codex is read only for a family the user named.
  const st: GptStatus =
    on || family
      ? await gptStatus($)
      : { argv: null, models: [], limits: {}, at: 0 };
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
  if (r.provider === "none") return `Not delegated: ${r.reason}.`;
  if (r.provider === "claude")
    return claudeAnswer(
      r,
      !on
        ? "GPT is off in the band"
        : st.error
          ? `Codex: ${st.error}`
          : "Claude has the room or the role",
      input.role,
    );
  if (!st.argv)
    return "Not delegated: Codex is not available here. Do it here.";
  const writes = r.sandbox === "workspace-write";
  if (writes && writing)
    return "Not started: another GPT run that writes is still going. Wait for it, or make this a read-only role.";
  if (writes) writing = true;
  try {
    const root = await $.session.root();
    const brief = `${input.brief.trim()}\n\n${FOOTER[input.role]}`;
    const before = await changed($, root);
    let last = 0;
    const show = async (line: string) => {
      const t = await $.clock.now();
      if (t - last < 2000) return;
      last = t;
      try {
        $.ui.notice(toolUseId, `GPT ${r.name} · ${input.role} · ${line}`);
      } catch {
        // the call's dialog is gone: nothing to show it under
      }
    };
    let run: Run;
    try {
      run = await runCodex(
        $,
        [...st.argv, ...codexArgs(r, root, input.thread)],
        brief,
        root,
        show,
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
    if (writes) await flowDelegated($, files); // GPT's changes count
    const head = `GPT ${r.name} (${input.role}, ${r.sandbox}, effort ${r.effort})`;
    if (run.error && !run.answer)
      return `${head} failed: ${run.error}\nSay why to the user, then do it here or on Claude.`;
    const answer = run.answer.trim();
    return [
      `${head}${run.error ? ` ended with: ${run.error}` : " finished"} · ${run.commands} commands` +
        (run.thread ? ` · thread ${run.thread}` : ""),
      files.length ? `Changed: ${files.join(", ")}` : "Changed: nothing",
      "--- final message ---",
      answer.length > MAX_ANSWER
        ? `${answer.slice(0, MAX_ANSWER)}\n[incomplete: cut at ${MAX_ANSWER} characters${run.thread ? `, ask for the rest with thread "${run.thread}"` : ""}]`
        : answer || "(empty)",
      "---",
      writes
        ? "Review its diff and run the checks yourself before calling it done."
        : "Weigh it against your own judgment before you rely on it.",
      run.thread
        ? `A follow-up for this run: delegate with thread "${run.thread}".`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  } finally {
    if (writes) writing = false;
  }
}

export function delegation(on: On) {
  // A deferred tool reads as absent to skills that check whether it exists.
  on("tool.describe", { tool: TOOL }, async ($, e, next) => ({
    ...(await next(e)),
    isDeferred: false,
  }));

  // Reading runs without a prompt, and so does writing while GPT is on (the user's standing
  // request); any other change asks first, as any tool does.
  on("tool.check", { tool: TOOL }, async ($, e, next) => {
    const role = (e.input as { role?: Role } | undefined)?.role;
    const writes = role !== undefined && WRITES.includes(role);
    const standing = await gptOn($);
    if (!writes || standing) return { decision: "allow" as const };
    return next(e);
  });

  on("tool.call", { tool: TOOL }, async ($, e) => {
    const input = readInput(e);
    if (typeof input === "string") return { result: input };
    return { result: await delegate($, input, e.tool_use_id) };
  });

  on("command.run", { command: "gpt" }, gptCommandRun);
}
