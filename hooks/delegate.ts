import type { CommandSpec, EngineInterface, On, ToolSpec } from "claude-code";

import {
  type Author,
  type Family,
  FAMILIES,
  type Meters,
  newest,
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
  setGptOn,
  setPins,
  type GptStatus,
} from "./codex-run";
import { flowDelegated } from "./flow";

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

export const gptCommand: CommandSpec = {
  name: "gpt",
  description:
    "kit: GPT on or off, its models and ChatGPT meters; pin a family to a model id or unpin it",
  argumentHint: "[on | off | pin <family> <id> | unpin <family>]",
  immediate: true,
};

let writing = false; // a GPT run that writes is going: one at a time in this checkout

async function claudeMeters($: EngineInterface): Promise<Meters> {
  const usage = await $.session.usage().catch(() => undefined);
  const out: Meters = {};
  for (const r of usage?.rateLimits ?? [])
    if (r.kind === "five_hour" || r.kind === "seven_day")
      out[r.kind] = { pct: r.percentUsed, resetsAt: r.resetsAt };
  return out;
}

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

const FOOTER: Record<"read" | "write" | "review", string> = {
  read: "Read only: change no files. End with a short report: what you found, with file paths.",
  review:
    "Read only: change no files. Review the uncommitted changes (git status, git diff, new " +
    "files too) against the brief above. List findings most severe first as [P0] to [P3] with " +
    "file:line and why; no fixes. No findings → say so.",
  write:
    "Follow the project's AGENTS.md. Commit, push and deploy nothing. End with a short " +
    "report: what you changed, the checks you ran with their result, open points.",
};

function claudeAnswer(
  r: Extract<Route, { provider: "claude" }>,
  why: string,
): string {
  const ro = r.writes ? "" : ", read-only: it edits nothing";
  return (
    `Route: Claude (${why}). Run the brief with the Agent tool: subagent_type ` +
    `"${r.subagentType}", model "${r.model}", effort "${r.effort}"${ro}. Then check its ` +
    "result here before you rely on it."
  );
}

async function delegate(
  $: EngineInterface,
  input: Input,
  toolUseId: string,
): Promise<string> {
  const on = await gptOn($);
  // With GPT off, Codex is read only for a family the user named.
  const st: GptStatus =
    on || input.family
      ? await gptStatus($)
      : { argv: null, models: [], limits: {}, at: 0 };
  const now = await $.clock.now();
  const r = route({
    role: input.role,
    author: input.author,
    family: input.family,
    gptOn: on,
    models: newest(st.models, await pins($)),
    claude: await claudeMeters($),
    gpt: st.argv && !st.error ? st.limits : undefined,
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
    );
  if (!st.argv)
    return "Not delegated: Codex is not available here. Do it here.";
  const writes = r.sandbox === "workspace-write";
  if (writes && writing)
    return "Not started: another GPT run that writes is still going. Wait for it, or make this a read-only role.";
  const root = await $.session.root();
  const footer = r.review ? "review" : writes ? "write" : "read";
  const brief = `${input.brief.trim()}\n\n${FOOTER[footer]}`;
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
  if (writes) writing = true;
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
    if (writes) writing = false;
    void gptStatus($, true); // the ChatGPT meters moved
  }
  const files = [...(await changed($, root))].filter((f) => !before.has(f));
  if (writes) await flowDelegated($, files.map((f) => f.slice(3))); // GPT's changes count
  const head = `GPT ${r.name} (${input.role}, ${r.sandbox}, effort ${r.effort})`;
  if (run.error && !run.answer)
    return `${head} failed: ${run.error}\nSay why to the user, then do it here or on Claude.`;
  const answer = run.answer.trim();
  return [
    `${head}${run.error ? ` ended with: ${run.error}` : " finished"} · ${run.commands} commands` +
      (run.thread ? ` · thread ${run.thread}` : ""),
    files.length
      ? `Changed: ${files.map((f) => f.slice(3)).join(", ")}`
      : "Changed: nothing",
    "--- final message ---",
    answer.length > MAX_ANSWER
      ? `${answer.slice(0, MAX_ANSWER)}\n[cut at ${MAX_ANSWER} characters]`
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
}

function statusText(
  st: GptStatus,
  models: Partial<Record<Family, { id: string; name: string }>>,
  pinned: Partial<Record<Family, string>>,
): string {
  const lines = FAMILIES.map((f) => {
    const m = models[f];
    return `${f}: ${m ? `${m.name} (${m.id})` : "none"}${pinned[f] ? " · pinned" : ""}`;
  });
  const pct = (k: "five_hour" | "seven_day") =>
    st.limits[k] ? `${Math.round(st.limits[k]!.pct)}%` : "?";
  lines.push(
    st.error
      ? `Codex: ${st.error}`
      : `ChatGPT ${st.limits.plan ?? ""}: 5h ${pct("five_hour")} · weekly ${pct("seven_day")}`,
  );
  return lines.join("\n");
}

export function delegation(on: On) {
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

  on("command.run", { command: "gpt" }, async ($, e) => {
    const [verb, family, id] = e.args.trim().split(/\s+/);
    if (verb === "on" || verb === "off") {
      await setGptOn($, verb === "on");
      $.ui.invalidate("ui.render");
      return {
        text:
          verb === "on"
            ? "kit: GPT on: delegated work may run on GPT when ChatGPT has room."
            : "kit: GPT off: delegated work stays on Claude; a GPT model runs only when you name it.",
      };
    }
    if (!(await gptOn($)))
      return { text: "kit: GPT is off. /gpt on turns it on." };
    const pinned = await pins($);
    if (
      (verb === "pin" || verb === "unpin") &&
      FAMILIES.includes(family as Family)
    ) {
      const next = { ...pinned };
      if (verb === "pin" && id) next[family as Family] = id;
      else delete next[family as Family];
      await setPins($, next);
      const st = await gptStatus($);
      return { text: statusText(st, newest(st.models, next), next) };
    }
    const st = await gptStatus($, true);
    return { text: statusText(st, newest(st.models, pinned), pinned) };
  });
}
