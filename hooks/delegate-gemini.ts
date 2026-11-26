import type { EngineInterface } from "claude-code";

import { agyStatus, tooLong } from "./agy-run";
import {
  changedLines,
  type GeminiFamily,
  geminiRoute,
  type Role,
} from "./delegate-policy";
import {
  acquireWriter,
  agyThreads,
  FOOTER,
  releaseWriter,
  runGemini,
} from "./delegate-run";
import { flowNoReviewer, flowReviewEnd, flowReviewStart } from "./flow";
import { geminiOn } from "./gemini-switch";

// The Gemini side of mcp__kit__delegate (delegate.ts): the brief agy gets, one run and its
// answer, asked for or standing in for GPT.

const MAX_ANSWER_GEMINI = 16_000;

export type GeminiInput = {
  role: Role;
  brief: string;
  geminiFamily?: GeminiFamily;
  thread?: string;
  dirs?: string[];
};

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

// Whether Gemini can take what GPT cannot: its switch on, agy found with a model for the role.
export async function geminiStandsIn($: EngineInterface, role: Role) {
  if (!(await geminiOn($))) return false;
  const st = await agyStatus($);
  return !!st.path && geminiRoute(role, st.models).provider === "gemini";
}

// `ok` is false when there is no answer. Standing in for GPT (`standIn`), a run that cannot
// start leaves no "no reviewer" note: delegate.ts goes on to what it would have done.
export async function delegateGemini(
  $: EngineInterface,
  input: GeminiInput,
  toolUseId: string,
  standIn = false,
): Promise<{ ok: boolean; text: string }> {
  const none = (text: string) => ({ ok: false, text });
  const noReviewer = async (why: string) => {
    if (input.role === "review" && !standIn) await flowNoReviewer($, why);
  };
  const long = tooLong(input.brief);
  if (long) return none(`Not run: ${long}`);
  const st = await agyStatus($);
  if (!st.path)
    return none("Not delegated: agy (the Antigravity CLI) was not found on the PATH or in the usual install places (WinGet Links, ~/.local/bin, Homebrew). Before telling the user it is missing, run `where.exe agy` (Windows) or `which agy` yourself; then do it here.");
  const resumed = input.thread && agyThreads.has(input.thread);
  if (input.thread && !resumed)
    return none("Not run: that thread is not a Gemini run of this session (a GPT thread cannot continue on Gemini).");
  const r = geminiRoute(input.role, st.models, input.geminiFamily);
  if (r.provider === "none") {
    await noReviewer(r.reason);
    return none(`Not delegated: ${r.reason}.`);
  }
  if (r.writes && !acquireWriter())
    return none("Not started: another run that writes is still going. Wait for it, or make this a read-only role.");
  try {
    // The review's fingerprint comes first: a change while the diff is read voids the review.
    const start =
      input.role === "review" ? await flowReviewStart($) : undefined;
    let brief: string;
    try {
      brief = await geminiBrief($, input.brief, input.role, input.dirs);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      await noReviewer(why);
      return none(`Not delegated: ${why}. Do it here.`);
    }
    const long = tooLong(brief);
    if (long) return none(`Not run: ${long}`);
    // A stand-in reads the switch again as agy starts: another chat may have switched it off.
    let off = false;
    let sent = false; // agy got the brief at least once
    const allowed = async () => {
      const on = await geminiOn($);
      off ||= !on;
      sent ||= on;
      return on;
    };
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
      standIn ? allowed : undefined,
    );
    if (off)
      return none(
        sent
          ? "No answer: Gemini was switched off before a second attempt; the first one had already sent the brief."
          : "Not delegated: Gemini was switched off meanwhile.",
      );
    if (input.role === "review")
      await flowReviewEnd($, start, "gemini", run.answer, run.error);
    const head = `${r.name} (${input.role}, ${r.writes ? "accept-edits" : "plan, read-only"}, effort ${r.effort})`;
    if (run.error && !run.answer.trim())
      return none(
        `${head} failed: ${run.error}\nSay why to the user, then do it here or on another family. Nothing was switched silently.`,
      );
    const answer = run.answer.trim();
    const text = [
      `${head}${run.error ? ` ended with: ${run.error}` : " finished"}` +
        (run.retried
          ? ` · retried once after a denied ${run.retried.join(", ")}`
          : run.denied?.length
            ? ` · denied: ${run.denied.join(", ")}`
            : "") +
        (run.conversation ? ` · thread ${run.conversation}` : ""),
      changedLines(r.writes, files),
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
    return { ok: !!answer, text };
  } finally {
    if (r.writes) releaseWriter();
  }
}
