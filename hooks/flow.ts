import type { EngineInterface, On, SessionMessage } from "claude-code";

import { gateLevel, reviewProblem } from "./flow-evidence";
import {
  checkOf,
  checkSettled,
  withoutStatus,
  type CheckKind,
} from "./flow-check";
import { flowCommandRun } from "./flow-command";
import { ensureRequired } from "./flow-required";
import { promptLevels, raiseLevels } from "./flow-levels";
import { classifyPrompt, isResume } from "./flow-prompt";
import { endEntry, type Ending } from "./flow-log";
import * as policy from "./flow-policy";
import { awayRoot, log, within, worktreePrint } from "./flow-store";
import { state, load, save, taskPrint } from "./flow-state";
import { FLOW_NOTE, isKitNote } from "./kit-notes";
import { isThin, type Kind } from "./model-policy";
import { turnBlock } from "./readiness";
import { readTurn } from "./read-watch";
import type { Level, Levels } from "./task-policy";

export {
  flowSpawned,
  flowAnswer,
  flowReviewStart,
  flowReviewEnd,
  flowNoReviewer,
} from "./flow-agents";
export { flowCommand } from "./flow-command";

// Flow (always on; /flow reports it, flow-command.ts): this chat's open change task, fed by its
// prompts (auto-model.ts), edits, turn ends and compactions (register.tsx, compaction.ts), shell
// checks (below) and mcp__kit__run_task's (task-runner.ts), the verifier's answer
// (register.tsx's turn.complete) and GPT's changes (delegate-run.ts). The worktree's git
// fingerprint is the evidence, per kind of check (flow-check.ts); the task is kept per session in
// $.store, so a reload or restart keeps it. It sends the track's notes and task-policy's decision,
// holds a turn that ends on unchecked changes; unverified work stays open. Reviews come from
// delegate and flow-agents.ts. It logs it all for 14 days.

export type CheckStart = {
  startedAt: number;
  startPrint: string | undefined;
  kinds: CheckKind[];
  away?: string; // the task's other repo when the folder was judged
};

let promptPrint: string | undefined; // the worktree when the last prompt came in
let endedOnQuestion = false; // the last turn ended on a question to the user

// The main chat's context in tokens, for the log; undefined without a reading.
async function contextNow($: EngineInterface): Promise<number | undefined> {
  const n = (await $.session.usage().catch(() => undefined))?.context?.tokens;
  return typeof n === "number" && n > 0 ? n : undefined;
}

// A point of a task with the context then; nothing without a reading.
async function logContext($: EngineInterface, task: number, text: string) {
  const ctx = await contextNow($);
  if (ctx !== undefined) await log($, { task, event: "ctx", text, ctx });
}

// Flow growth or a failing check: the open task's levels go up, with the note for it.
async function raise($: EngineInterface, why: string) {
  if (!state.task) return undefined;
  const raised = await raiseLevels($, state.task.levels, state.task.id, why);
  if (raised) state.task = { ...state.task, levels: raised.levels };
  return raised?.note;
}

export async function flowLevels(
  $: EngineInterface,
): Promise<Levels | undefined> {
  await load($);
  return state.task?.levels;
}

// The Verify level the gate holds the open task to; 0 without a task.
export async function flowGateLevel($: EngineInterface): Promise<number> {
  await load($);
  return state.task ? gateLevel(state.task) : 0;
}

// Whether Gemini wrote source in the open task: it may then not review it.
export async function flowGeminiWrote($: EngineInterface): Promise<boolean> {
  await load($);
  return !!state.task?.geminiWrote;
}

// Where a shell command runs: a leading `cd <dir> &&`, else the session's folder. Any other
// `cd` (`;` after it, a second one) is not followed: undefined, so it counts nowhere.
async function commandDir(
  $: EngineInterface,
  command: string,
): Promise<string | undefined> {
  const base =
    (await $.session.cwd().catch(() => undefined)) ??
    (await $.session.root().catch(() => undefined));
  // Every cd the shell may run (`command cd`, `builtin cd`, a quoted "cd" where a command
  // starts too); other quoted text (a test filter `-t "cd"`) and comments left out.
  const cds = command
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q, at: number) =>
      /^["'](?:cd|pushd|popd)["']$/.test(q) &&
      /(?:^|[;&|(\n]|\b(?:command|builtin|exec|then|do|else))\s*$/.test(
        command.slice(0, at),
      )
        ? "cd"
        : '""',
    )
    .replace(/(^|\s)#[^\n]*/g, "$1")
    .match(/(?<![\w./-])(?:cd|pushd|popd)(?![\w./-])/g);
  if (!cds) return base;
  const m = /^\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)\s*&&/.exec(command);
  if (!m || cds.length > 1) return undefined;
  const dir = m[1]!.replace(/^["']|["']$/g, "");
  if (/^[~$]/.test(dir)) return undefined; // not resolved here: counts nowhere
  if (/^(?:[a-zA-Z]:)?[\\/]/.test(dir)) return dir;
  return base ? `${base.replace(/[\\/]+$/, "")}/${dir}` : undefined;
}

// A check counts for the worktree it started on, whoever ran it (a subagent's too). `where`:
// the folder it runs in, when known; a task whose code is in another repo (`away`) takes no
// evidence from a check outside it, and gets that repo back to say so.
export async function flowCheckStart(
  $: EngineInterface,
  kinds: CheckKind[],
  where?: { dir: string | undefined },
): Promise<CheckStart | { away: string } | undefined> {
  await state.lookup; // an edit's repo, still being found, decides where this check counts
  await load($);
  if (!state.task) return undefined;
  const away = state.task.away;
  if (away && where && !(where.dir && within(where.dir, away))) return { away };
  await ensureRequired($);
  state.task = { ...state.task, checkCalls: (state.task.checkCalls ?? 0) + 1 };
  await save($);
  return {
    startedAt: await $.clock.now(),
    startPrint: await taskPrint($),
    kinds,
    away,
  };
}

// A Bash command that is not a check: counted so the hold can say none was recognised.
export async function flowShellSeen($: EngineInterface): Promise<void> {
  await load($);
  if (!state.task) return;
  state.task = { ...state.task, shellCalls: (state.task.shellCalls ?? 0) + 1 };
  await save($);
}

export async function flowCheckEnd(
  $: EngineInterface,
  start: CheckStart,
  passed: boolean,
  output?: string,
): Promise<string | undefined> {
  await state.lookup;
  await load($);
  if (!state.task) return undefined;
  // An edit moved the task to another repo while the check started: the folder judged then no
  // longer says where its code is.
  if (state.task.away !== start.away) return undefined;
  const before = state.task;
  state.task = policy.onCheck(
    state.task,
    passed,
    start.startedAt,
    start.startPrint,
    start.kinds,
    output,
  );
  // The task's first failing check raises its levels once; later ones are the same work.
  const note =
    !passed && state.task.failed === 1
      ? await raise($, "a failing check")
      : undefined;
  await save($);
  if (passed && !before.passLogged) {
    state.task = { ...state.task, passLogged: true };
    await save($);
    await logContext($, before.id, "first pass");
  }
  return note;
}

const ending = (t: policy.Task, p: string | undefined): Ending => {
  if (!policy.changed(t, p)) return "no change";
  if (policy.verified(t, p)) return "verified";
  return t.stopAsked ? "waived" : "unresolved";
};

// A typed prompt, already sorted into its kind: the note to send with it.
export async function flowPrompt(
  $: EngineInterface,
  text: string,
  kind: Kind,
): Promise<string | undefined> {
  readTurn();
  await load($);
  // A pending readiness block waits for one short prompt, the go-ahead ("ja, bouwen"), and no
  // longer: a request of its own (a command too) starts a task the block was not written for.
  if (
    pendingBlock &&
    (++pendingBlock.prompts > 1 || !isThin(text) || text.trim().startsWith("/"))
  )
    pendingBlock = undefined;
  const now = await $.clock.now();
  const raw = await worktreePrint($);
  promptPrint = raw; // a new task's base, in the session root
  const p = state.task?.away ? undefined : raw; // what the open task is judged by
  // A short reply ("ja") continues an open task; without one it is a request of its own.
  const thin = !!state.task && isThin(text);
  const labels = await classifyPrompt($, text, kind, thin);
  const { verify, explore, ready } = labels;
  const change = isResume(text) ? "heavy" : labels.change;
  const step = policy.onPrompt({
    task: state.task,
    kind,
    change,
    thin,
    answering: endedOnQuestion,
    text,
    id: now,
    print: p,
  });
  endedOnQuestion = false;
  if (step.ended)
    await log($, {
      ...endEntry(step.ended, ending(step.ended, p), now),
      ctx: await contextNow($),
    });
  state.task = step.task;
  // A task the prompt opened starts from the session root, whatever the last one was judged by.
  if (
    state.task &&
    state.task.id === now &&
    !state.task.away &&
    state.task.basePrint === undefined
  )
    state.task = { ...state.task, basePrint: raw };
  await ensureRequired($);
  const kept = ["continue", "escalate", "fold"].includes(step.event);
  const decided = await promptLevels($, {
    text,
    kind,
    change,
    verify,
    explore,
    ready,
    thin,
    prev: kept ? state.task?.levels : undefined,
    gate: kept ? (state.task?.gateV ?? state.task?.levels?.v) : undefined,
    grew: step.event === "escalate",
    task: state.task?.id,
  });
  if (state.task && decided.levels)
    state.task = {
      ...state.task,
      levels: decided.levels,
      gateV: decided.gateV,
    };
  await save($);
  if (["start", "escalate", "fold"].includes(step.event))
    await log($, {
      task: state.task?.id,
      event: step.event,
      text: text.trim().slice(0, 60),
      track: state.task?.track,
      kind,
      change,
      reason:
        step.event === "fold"
          ? "new request on open work"
          : step.event === "escalate"
            ? "the prompt asked for more"
            : undefined,
    });
  return [step.note, decided.note].filter(Boolean).join("\n") || undefined;
}

// A file written or edited, by this chat or one of its subagents: the note for the tool's
// result when the task grew (the main chat's only: a subagent's note would reach the wrong
// reader).
export async function flowEdit(
  $: EngineInterface,
  path: string,
  fromAgent = false,
  gpt: boolean | "gemini" = false,
): Promise<string | undefined> {
  await load($);
  const now = await $.clock.now();
  const unedited = !state.task || state.task.lastEditAt === 0;
  const step = policy.onEdit(state.task, path, now, now, promptPrint, gpt);
  if (!step) return undefined;
  state.task = step.task; // recorded at once: a commit meanwhile sees this edit
  // Code in another repo (a worktree): the session root's print would credit or hold this task
  // for what happens there, so it goes by tool calls, its checks run there, and its commands
  // are read again from both repos. Checks and the commit gate wait for it (`state.lookup`).
  const source = policy.isSource(path.replace(/\\/g, "/"));
  if (source) state.lookups = (state.lookups ?? 0) + 1; // a judgement under way is made again
  const found = source
    ? awayRoot($, path).catch(() => undefined)
    : Promise.resolve(undefined);
  // Set the moment it is known, before anyone waiting on it goes on.
  const lookup = found.then((away) => {
    if (away && state.task && state.task.away !== away)
      state.task = {
        ...state.task,
        away,
        basePrint: undefined,
        required: undefined,
        requiredRoot: undefined,
        // Failures seen before the first edit were the session root's, not that repo's.
        baseline: {},
      };
  });
  // Chained: a quicker edit meanwhile must not end the wait for this one.
  const all = Promise.all([state.lookup, lookup]);
  state.lookup = all;
  await lookup; // only its own: an edit never waits on another's git
  void all.then(() => {
    if (state.lookup === all) state.lookup = undefined;
  });
  if (!state.task) return undefined;
  await ensureRequired($);
  await save($);
  if (step.started)
    await log($, {
      task: state.task.id,
      event: "start",
      text: path,
      track: state.task.track,
      reason: "an edit outside any task",
    });
  if (unedited && state.task.lastEditAt === now)
    await logContext($, state.task.id, "first edit");
  if (!step.note) return undefined;
  if (state.task.levels)
    state.task = {
      ...state.task,
      gateV: Math.min(
        3,
        (state.task.gateV ?? state.task.levels.v) + 1,
      ) as Level,
    };
  await log($, {
    task: state.task.id,
    event: "escalate",
    text: path,
    track: state.task.track,
    reason: `${state.task.files.length} files`,
  });
  const raised = await raise($, `grew to ${state.task.track}`);
  await save($);
  if (fromAgent) return undefined;
  return raised ? `${step.note}\n${raised}` : step.note;
}

// GPT or Gemini changed files through mcp__kit__delegate: they count as this chat's changes.
export async function flowDelegated(
  $: EngineInterface,
  files: string[],
  by: true | "gemini" = true,
) {
  for (const f of files) await flowEdit($, f, true, by);
}

// The turn wants to end: why it should go on, if it should.
export async function flowStop(
  $: EngineInterface,
  lastMessage: string | undefined,
): Promise<string | undefined> {
  await state.lookup; // a task found to be away goes by tool calls, not by this print
  await load($);
  const raw = await worktreePrint($);
  // Code changed this turn with no task open (a shell edit, a subagent): git saw it.
  if (
    !state.task &&
    raw !== undefined &&
    promptPrint !== undefined &&
    raw !== promptPrint
  ) {
    const now = await $.clock.now();
    state.task = policy.newTask(now, "light", promptPrint);
    await log($, {
      task: state.task.id,
      event: "start",
      text: "",
      track: "light",
      reason: "changes git saw",
    });
  }
  await noteBlock($);
  const before = state.task;
  const p = state.task?.away ? undefined : raw; // what the open task is judged by
  const v = policy.stopVerdict(state.task, lastMessage, p);
  endedOnQuestion = (lastMessage ?? "").trim().endsWith("?");
  promptPrint = raw; // the next turn's changes count from here
  state.task = v.task;
  await save($);
  const now = await $.clock.now();
  if (v.ended)
    await log($, {
      ...endEntry(v.ended, "verified", now),
      ctx: await contextNow($),
    });
  else if (before && v.outcome !== "none")
    await log($, {
      task: before.id,
      event: v.outcome,
      text: before.files.slice(0, 3).join(", "),
      track: before.track,
      reason: v.block ? v.block.split(":")[1]?.trim().slice(0, 80) : undefined,
    });
  return v.block;
}

// After flowStop: the turn closed every task (auto-compact.ts).
export const flowClosed = (): boolean => !state.task;

// After a compaction: what the open task still needs, for the recovery note.
export function flowRecovery(): string | undefined {
  if (!state.task || state.task.lastEditAt === 0) return undefined;
  const files = state.task.files.slice(0, 5).join(", ") || "code";
  // no print: promptPrint may predate this turn's edits, so judge test currency by time; a
  // no-reviewer excuse is keyed by print, so it counts here whatever its round
  const verifier =
    policy.needsVerifier(state.task, undefined) ||
    (state.task.track === "heavy" &&
      state.task.noReviewer !== undefined &&
      reviewProblem(state.task, undefined) !== undefined)
      ? " and the kit:verifier on its criteria"
      : "";
  const level = gateLevel(state.task);
  const review =
    level >= 3
      ? " and an other-family review"
      : level === 2
        ? " and a review"
        : "";
  return `${FLOW_NOTE}${state.task.track} task changed ${files}; before you finish, run the check that covers it${verifier}${review}.`;
}

// A readiness block seen at the end of a turn with no task open: the task the next turn opens
// takes it (a block, then the user's go-ahead, then the first edit). One turn only.
let pendingBlock: { block: string; at: number; prompts: number } | undefined;

// The open task keeps the newest readiness block of its turns (readiness.ts).
function keepBlock(block: string | undefined, now: number) {
  if (!state.task) {
    // A turn or compaction without a new block leaves a pending one to the prompt count.
    if (block) pendingBlock = { block, at: now, prompts: 0 };
    return;
  }
  const adopted =
    pendingBlock && state.task.id >= pendingBlock.at
      ? pendingBlock.block
      : undefined;
  pendingBlock = undefined;
  const readiness = block ?? state.task.readiness ?? adopted;
  if (readiness !== state.task.readiness)
    state.task = { ...state.task, readiness };
}

// The readiness block the turn wrote, at its end (flowStop, or flowTurnEnd when flow does not
// judge that end).
// With the store unread and no task in memory, the block waits for the stored task
// (flow-state's `block`; the newest wins).
async function noteBlock($: EngineInterface) {
  const owner = !state.task ? state.unreadFor : undefined; // before the await
  const said = await $.session.messages().catch(() => undefined);
  if (!said) return;
  const block = turnBlock(said, isKitNote);
  if (owner) {
    // Both: the stored task takes it once read; with none stored, a short go-ahead's new task.
    if (block) {
      state.block = { for: owner, text: block };
      pendingBlock = { block, at: await $.clock.now(), prompts: 0 };
    }
    return;
  }
  keepBlock(block, await $.clock.now());
}

// A main-chat turn ended that flow does not judge (background work, another hook's hold): its
// readiness block still counts.
export async function flowTurnEnd($: EngineInterface) {
  // Unreadable store: the block still goes on the task in memory, which joins the stored one.
  const loaded = await load($);
  const before = state.task?.readiness;
  await noteBlock($);
  if (loaded && state.task?.readiness !== before) await save($);
}

// The open task's readiness block for the note after a compaction (compaction.ts), taking any
// block the running turn wrote first. `known: false`: the task could not be read, so an
// earlier note must stay.
export async function flowReadiness(
  $: EngineInterface,
  messages: readonly SessionMessage[],
): Promise<{ known: false } | { known: true; id?: number; block?: string }> {
  // A compaction right after a resume comes before any other flow event.
  if (!(await load($))) return { known: false };
  const before = state.task?.readiness;
  keepBlock(turnBlock(messages, isKitNote), await $.clock.now());
  if (state.task?.readiness !== before) await save($);
  return { known: true, id: state.task?.id, block: state.task?.readiness };
}

// /clear: the open task ends here.
export async function resetFlow($: EngineInterface) {
  await load($);
  if (state.task)
    await log($, endEntry(state.task, "reset", await $.clock.now()));
  state.task = undefined;
  pendingBlock = undefined;
  promptPrint = undefined;
  endedOnQuestion = false;
  await save($);
}

export function flow(on: On) {
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const found = checkOf(e.command);
    const begun = found
      ? await flowCheckStart($, found.kinds, {
          dir: await commandDir($, e.command),
        })
      : undefined;
    const away = begun && !("startedAt" in begun) ? begun.away : undefined;
    const start = begun && "startedAt" in begun ? begun : undefined;
    const check = away ? undefined : found;
    if (!check) await flowShellSeen($);
    const ran = await next(e);
    if (away && ran.deny === undefined)
      return {
        ...ran,
        context: [
          ...(ran.context ?? []),
          `kit flow: this check ran outside ${away}, where this task's code is, so it does not count for it. Run it there: cd ${away} && <check>.`,
        ],
      };
    if (!start || !check || ran.deny !== undefined) return ran;
    const passed = checkSettled(check, ran.isError === true, ran.text ?? "");
    if (passed === undefined) return ran; // a masked status: no evidence either way
    const text = ran.text ?? "";
    const note = await flowCheckEnd(
      $,
      start,
      passed,
      withoutStatus(check, text),
    );
    return note ? { ...ran, context: [...(ran.context ?? []), note] } : ran;
  });

  on("command.run", { command: "flow" }, flowCommandRun);
}
