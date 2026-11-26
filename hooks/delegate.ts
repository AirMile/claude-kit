import type { EngineInterface, On, ToolSpec } from "claude-code";

import {
  type Author,
  changedLines,
  type Family,
  FAMILIES,
  GEMINI_FAMILIES,
  type GeminiFamily,
  type Provider,
  type Role,
  ROLES,
  type Route,
} from "./delegate-policy";
import { delegateGemini, geminiStandsIn } from "./delegate-gemini";
import {
  flowGeminiWrote,
  flowNoReviewer,
  flowReviewEnd,
  flowReviewStart,
} from "./flow";
import { gptOn } from "./codex-run";
import { geminiCommandRun } from "./gemini-command";
import { gptCommandRun } from "./gpt-command";
import {
  acquireWriter,
  agyThreads,
  FOOTER,
  releaseWriter,
  routeDelegation,
  runDelegated,
} from "./delegate-run";

export { gptCommand } from "./gpt-command";

// mcp__kit__delegate: this chat hands a self-contained piece of work to GPT (a review, a second
// plan, a model the user names, and on Claude Pro the rest too) or to a Claude subagent
// (delegate-policy.ts picks). A GPT route runs here through the Codex CLI and returns
// only Codex's final message and the files that changed: its whole run (every command and its
// output) stays in Codex's own session file. A Claude route returns how to run it with the Agent
// tool (a mod could start it and read its answer from turn.complete; not done yet). The Codex
// side (its catalog, the ChatGPT meters, a run) is codex-run.ts.

const TOOL = "mcp__kit__delegate";
const MAX_ANSWER = 6000;
const WRITES: readonly Role[] = ["build", "build+"];

export const delegateTool: ToolSpec = {
  name: "delegate",
  description:
    "kit: hand a self-contained piece of work to another model family or a Claude subagent. GPT " +
    "(Codex) takes a review (the uncommitted changes; author: who wrote them) and a plan (a blind " +
    "second plan: never include your own), when ChatGPT's limits have room. search (find code), " +
    "research (read and weigh) and build go to GPT only on Claude Pro, to spare Claude's limits; " +
    "on Max they stay on Claude (for build: make the change here). The brief stands alone: goal, " +
    "constraints, files, checks to run. family: a GPT model the user asked for by name (sol, " +
    "terra, luna, astra), which then runs any role, or a Gemini one (hydrogen, the default, flash, pro; naming one sets " +
    "provider gemini). provider: gemini when the user asks for Gemini, agy or Antigravity. " +
    "Unasked, Gemini only takes a review or plan GPT cannot (switched off or no room) while " +
    "kit's Gemini switch is on, and the answer says so; provider gpt rules that out. " +
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
  asked?: boolean; // provider gpt given by name
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
  const asked = i.provider === "gpt"; // GPT picked by name: no stand-in
  return { role, brief: i.brief, author, family, provider, asked, geminiFamily, thread, dirs };
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
  if (input.provider === "gemini")
    return (await delegateGemini($, input, toolUseId)).text;
  if (input.thread && agyThreads.has(input.thread))
    return "Not run: that thread is a Gemini run; continue it with provider gemini.";
  const picked = await routeDelegation($, {
    ...input,
    // A Gemini-written change reviewed on GPT is another family: not the Claude-only rule.
    author: input.author === "gemini" ? undefined : input.author,
  });
  const gptOut =
    picked.provider === "claude"
      ? picked.r.provider === "claude" && picked.r.gptOut
      : picked.provider === "none" && picked.gptOut;
  // The user's own pick of GPT, a thread and Gemini's own code keep Gemini out.
  let missed = ""; // why Gemini could not stand in
  if (
    gptOut &&
    !input.asked &&
    !input.thread &&
    input.author !== "gemini" &&
    !(input.role === "review" && (await flowGeminiWrote($))) &&
    (await geminiStandsIn($, input.role))
  ) {
    const stood = await delegateGemini($, input, toolUseId, true);
    if (stood.ok)
      return `${gptOut}: Gemini stands in (kit's Gemini switch; /gemini off stops this).\n${stood.text}`;
    missed = `Gemini could not stand in: ${stood.text.split("\n")[0]}\n`;
  }
  if (picked.provider === "none") {
    if (input.role === "review") await flowNoReviewer($, picked.reason);
    return `${missed}Not delegated: ${picked.reason}.`;
  }
  if (picked.provider === "claude")
    return `${missed}${claudeAnswer(picked.r, picked.why, input.role)}`;
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
      changedLines(writes, files),
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
  on("command.run", { command: "gemini" }, geminiCommandRun);
}
