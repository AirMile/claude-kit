import type { EngineInterface, On, ToolSpec } from "claude-code";

import {
  type Author,
  type Family,
  FAMILIES,
  GEMINI_FAMILIES,
  type GeminiFamily,
  geminiRoute,
  type Provider,
  type Role,
  ROLES,
  type Route,
} from "./delegate-policy";
import { agyArgs, agyStatus, tooLong } from "./agy-run";
import { flowNoReviewer, flowReviewStart, flowReviewEnd } from "./flow";
import { gptOn } from "./codex-run";
import { gptCommandRun } from "./gpt-command";
import {
  acquireWriter,
  agyThreads,
  FOOTER,
  releaseWriter,
  routeDelegation,
  runDelegated,
  runGemini,
} from "./delegate-run";

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
const MAX_ANSWER_GEMINI = 16_000;
const WRITES: readonly Role[] = ["build", "build+"];

export const delegateTool: ToolSpec = {
  name: "delegate",
  description:
    "kit: hand a self-contained piece of work to Claude (a subagent), GPT (Codex) or, on request, " +
    "Gemini (agy, the Antigravity CLI), on " +
    "whichever plan has room and the newest model for its role. Roles: search (find code), " +
    "research (read and weigh, read-only), build (a change you can describe up front), build+ " +
    "(a hard change), review (the uncommitted changes; author: who wrote them), plan (a blind " +
    "second plan: never include your own). The brief stands alone: goal, constraints, files, " +
    "checks to run. family: a GPT model the user asked for by name (sol, terra, luna, astra), or " +
    "a Gemini one (flash, pro; naming one sets provider gemini). provider: gemini when the user " +
    "asks for Gemini, agy or Antigravity; it never runs unasked and shows no meters. " +
    "A brief states the decision you need, facts already known, files in scope and when to stop. " +
    "dirs: Gemini only, absolute folders besides the project that agy may read (goes through the permission check). " +
    "thread: continue an earlier GPT or Gemini run with a follow-up brief. A run returns its final " +
    "message and changed files; review its diff and run the checks yourself. A Claude route " +
    "says how to run it with the Agent tool.",
  inputSchema: {
    type: "object",
    properties: {
      role: { type: "string", enum: [...ROLES] },
      brief: { type: "string" },
      author: { type: "string", enum: ["claude", "gpt", "gemini"] },
      provider: { type: "string", enum: ["gpt", "gemini"] },
      family: { type: "string", enum: [...FAMILIES, ...GEMINI_FAMILIES] },
      thread: { type: "string" },
      dirs: { type: "array", items: { type: "string" } },
    },
    required: ["role", "brief"],
  },
};

type Input = {
  role: Role;
  brief: string;
  author?: Author;
  family?: Family;
  provider: Provider;
  geminiFamily?: GeminiFamily;
  thread?: string;
  dirs?: string[];
};

// A folder agy may also read goes to Google: absolute, not a root or home folder, no '..'.
function wideEnough(d: unknown): d is string {
  if (typeof d !== "string" || !/^(\/|[A-Za-z]:[\\/]|\\\\)/.test(d)) return false;
  const parts = d.split(/[\\/]+/).filter((x) => x && x !== ".");
  // /Users/me is a home folder (2); C:\Users\me is 3 parts; \\server\share is a share root (2).
  const least = /^[A-Za-z]:/.test(d) ? 4 : 3;
  return !parts.includes("..") && parts.length >= least;
}

function readInput(e: unknown): Input | string {
  const i = e as Record<string, unknown>;
  const role = i.role as Role;
  if (!ROLES.includes(role))
    return `Not run: role must be one of ${ROLES.join(", ")}.`;
  if (typeof i.brief !== "string" || !i.brief.trim())
    return "Not run: the brief is empty.";
  const geminiFamily = GEMINI_FAMILIES.includes(i.family as GeminiFamily)
    ? (i.family as GeminiFamily)
    : undefined;
  const provider: Provider =
    i.provider === "gemini" || geminiFamily ? "gemini" : "gpt";
  if (i.provider === "gpt" && geminiFamily)
    return `Not run: provider gpt contradicts family ${geminiFamily}, which is a Gemini one.`;
  if (provider === "gemini" && i.family && !geminiFamily)
    return `Not run: ${String(i.family)} is a GPT family; Gemini takes ${GEMINI_FAMILIES.join(" or ")}.`;
  if (provider === "gpt" && i.family && !FAMILIES.includes(i.family as Family))
    return `Not run: family must be one of ${[...FAMILIES, ...GEMINI_FAMILIES].join(", ")}.`;
  const family = FAMILIES.includes(i.family as Family)
    ? (i.family as Family)
    : undefined;
  const author =
    i.author === "gpt" || i.author === "claude" || i.author === "gemini"
      ? i.author
      : undefined;
  if (provider === "gemini" && author === "gemini")
    return "Not run: Gemini wrote this code, so a Gemini review would not be another family. Use GPT or Claude.";
  const thread =
    typeof i.thread === "string" && i.thread ? i.thread : undefined;
  let dirs: string[] | undefined;
  if (Array.isArray(i.dirs) && i.dirs.length) {
    if (provider !== "gemini")
      return "Not run: dirs is for Gemini (agy); a GPT run has its own sandbox.";
    if (i.dirs.length > 5 || !i.dirs.every(wideEnough))
      return (
        "Not run: dirs takes at most 5 absolute folders, each at least three levels deep " +
        "(not a drive, / or a home folder) and without '..'."
      );
    dirs = i.dirs;
  }
  return { role, brief: i.brief, author, family, provider, geminiFamily, thread, dirs };
}

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
  if (input.provider === "gemini") return delegateGemini($, input, toolUseId);
  if (input.thread && agyThreads.has(input.thread))
    return "Not run: that thread is a Gemini run; continue it with provider gemini.";
  const picked = await routeDelegation($, {
    ...input,
    // A Gemini-written change reviewed on GPT is another family: not the Claude-only rule.
    author: input.author === "gemini" ? undefined : input.author,
  });
  if (picked.provider === "none") {
    if (input.role === "review") await flowNoReviewer($, picked.reason);
    return `Not delegated: ${picked.reason}.`;
  }
  if (picked.provider === "claude")
    return claudeAnswer(picked.r, picked.why, input.role);
  if (picked.provider === "unavailable") {
    if (input.role === "review") await flowNoReviewer($, picked.reason);
    return `Not delegated: ${picked.reason}. Do it here.`;
  }
  const { r, argv } = picked;
  const writes = r.sandbox === "workspace-write";
  if (writes && !acquireWriter())
    return "Not started: another GPT run that writes is still going. Wait for it, or make this a read-only role.";
  try {
    const brief = `${input.brief.trim()}\n\n${FOOTER[input.role]}`;
    const start =
      input.role === "review" ? await flowReviewStart($) : undefined;
    const {
      run,
      files,
      head: info,
    } = await runDelegated($, r, argv, brief, toolUseId, input.thread);
    if (input.role === "review")
      await flowReviewEnd($, start, "gpt", run.answer, run.error);
    const head = `GPT ${info.name} (${input.role}, ${info.sandbox}, effort ${info.effort})`;
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
    if (writes) releaseWriter();
  }
}

// Headless agy cannot run shell commands, so a review gets the diff in the brief instead of
// being told to run git, and every brief says what it cannot do.
const GEMINI_NOTE =
  "You cannot run shell commands here (headless: they are denied): read files only, and say " +
  "which checks you could not run. Never call a tool you may not use: one denied call ends the " +
  "whole run with no answer. Put your conclusion first and keep the final answer under about " +
  "5000 characters; a longer one is cut.";
const noteFor = (root: string, dirs: readonly string[]) =>
  `${GEMINI_NOTE} You may read files only under ${[root, ...dirs].join(", ")}; for a file ` +
  "elsewhere, say that you could not read it.";
const DIFF_MAX = 120_000;

async function geminiBrief(
  $: EngineInterface,
  brief: string,
  role: Role,
  dirs: readonly string[] = [],
): Promise<string> {
  const footer =
    role === "review"
      ? FOOTER.review.replace(
          "(git status, git diff, new files too)",
          "(the diff and the list of new files are attached below; read the new files directly)",
        )
      : FOOTER[role];
  let extra = "";
  if (role === "review") {
    const run = async (argv: string[]): Promise<string> => {
      const r = await $.process.run(argv).catch(() => undefined);
      if (!r || r.exitCode !== 0 || r.isStdoutTruncated)
        throw new Error(`could not read the changes (${argv.slice(0, 4).join(" ")})`);
      return r.stdout;
    };
    const root = await $.session.root();
    const diff = await run(["git", "-C", root, "diff", "HEAD", "--no-ext-diff"]);
    const fresh = await run([
      "git", "-C", root, "ls-files", "--others", "--exclude-standard",
    ]);
    extra =
      `\n\nUncommitted diff (git diff HEAD)${diff.length > DIFF_MAX ? `, cut at ${DIFF_MAX} characters: read the files for the rest` : ""}:\n` +
      `${diff.slice(0, DIFF_MAX) || "(none)"}\n\nNew untracked files:\n${fresh.trim() || "(none)"}`;
  }
  return `${brief.trim()}${extra}\n\n${footer} ${noteFor(await $.session.root(), dirs)}`;
}

async function delegateGemini(
  $: EngineInterface,
  input: Input,
  toolUseId: string,
): Promise<string> {
  const long = tooLong(input.brief);
  if (long) return `Not run: ${long}`;
  const st = await agyStatus($);
  if (!st.path)
    return "Not delegated: agy (the Antigravity CLI) is not installed or not on this device's usual paths. Tell the user, then do it here.";
  const resumed = input.thread && agyThreads.has(input.thread);
  if (input.thread && !resumed)
    return "Not run: that thread is not a Gemini run of this session (a GPT thread cannot continue on Gemini).";
  const r = geminiRoute(input.role, st.models, input.geminiFamily);
  if (r.provider === "none") {
    if (input.role === "review") await flowNoReviewer($, r.reason);
    return `Not delegated: ${r.reason}.`;
  }
  if (r.writes && !acquireWriter())
    return "Not started: another run that writes is still going. Wait for it, or make this a read-only role.";
  try {
    // The review's fingerprint comes first: a change while the diff is read voids the review.
    const start =
      input.role === "review" ? await flowReviewStart($) : undefined;
    let brief: string;
    try {
      brief = await geminiBrief($, input.brief, input.role, input.dirs);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      if (input.role === "review") await flowNoReviewer($, why);
      return `Not delegated: ${why}. Do it here.`;
    }
    const long = tooLong(brief);
    if (long) return `Not run: ${long}`;
    const { run, files } = await runGemini(
      $,
      r,
      st.path,
      brief,
      toolUseId,
      input.role,
      input.thread,
      undefined,
      input.dirs,
    );
    if (input.role === "review")
      await flowReviewEnd($, start, "gemini", run.answer, run.error);
    const head = `Gemini ${r.name} (${input.role}, ${r.writes ? "accept-edits" : "plan, read-only"}, effort ${r.effort})`;
    if (run.error && !run.answer.trim())
      return `${head} failed: ${run.error}\nSay why to the user, then do it here or on another family. Nothing was switched silently.`;
    const answer = run.answer.trim();
    return [
      `${head}${run.error ? ` ended with: ${run.error}` : " finished"}` +
        (run.retried
          ? ` · retried once after a denied ${run.retried.join(", ")}`
          : run.denied?.length
            ? ` · denied: ${run.denied.join(", ")}`
            : "") +
        (run.conversation ? ` · thread ${run.conversation}` : ""),
      files.length ? `Changed: ${files.join(", ")}` : "Changed: nothing",
      "--- final message ---",
      answer.length > MAX_ANSWER_GEMINI
        ? `${answer.slice(0, MAX_ANSWER_GEMINI)}\n[incomplete: cut at ${MAX_ANSWER_GEMINI} characters${run.conversation ? `, ask for the rest with thread "${run.conversation}"` : ""}]`
        : answer || "(empty)",
      "---",
      r.writes
        ? "Review its diff and run the checks yourself before calling it done."
        : "Weigh it against your own judgment before you rely on it.",
      run.conversation
        ? `A follow-up for this run: delegate with provider gemini and thread "${run.conversation}".`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  } finally {
    if (r.writes) releaseWriter();
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
    const inp = e.input as
      | { role?: Role; provider?: string; family?: string }
      | undefined;
    const role = inp?.role;
    const writes = role !== undefined && WRITES.includes(role);
    // The band's GPT switch is a standing request for GPT only: Gemini writing asks first.
    const gemini =
      inp?.provider === "gemini" ||
      GEMINI_FAMILIES.includes(inp?.family as GeminiFamily);
    const standing = !gemini && (await gptOn($));
    // Extra folders go to Google: always a permission check, whatever the role (in auto mode the
    // classifier answers it, as for any tool).
    const dirs = (e.input as { dirs?: unknown } | undefined)?.dirs;
    if (gemini && Array.isArray(dirs) && dirs.length)
      return { decision: "ask" as const };
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
