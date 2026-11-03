import type { EngineInterface, On } from "claude-code";

import { gateLevel } from "./flow-evidence";
import { checkOf, checkPassed } from "./flow-check";
import { flowCommandRun } from "./flow-command";
import { promptLevels, raiseLevels } from "./flow-levels";
import { classifyPrompt } from "./flow-prompt";
import { endEntry, type Ending } from "./flow-log";
import * as policy from "./flow-policy";
import { log, worktreePrint } from "./flow-store";
import { state, load, save } from "./flow-state";
import { isThin, type Kind } from "./model-policy";
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
// (fresh-start.ts's turn.complete) and GPT's changes (delegate-run.ts). The worktree's git
// fingerprint is the evidence; the task is kept per session in $.store, so a reload or restart
// keeps it. It sends the track's notes and task-policy's decision (its levels on the task and
// in the band), holds a turn that ends on unchecked changes; unverified work stays open. Reviews come from
// delegate and flow-agents.ts. It logs it all for 14 days.

export type CheckStart = { startedAt: number; startPrint: string | undefined };

const BUILD =
  /^\s*\/(kit:)?build\b|<command-name>\/?(kit:)?build<\/command-name>/;

let promptPrint: string | undefined; // the worktree when the last prompt came in
let endedOnQuestion = false; // the last turn ended on a question to the user

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

// A check counts for the worktree it started on, whoever ran it (a subagent's too).
export async function flowCheckStart(
  $: EngineInterface,
): Promise<CheckStart | undefined> {
  await load($);
  if (!state.task) return undefined;
  return { startedAt: await $.clock.now(), startPrint: await worktreePrint($) };
}

export async function flowCheckEnd(
  $: EngineInterface,
  start: CheckStart,
  passed: boolean,
): Promise<string | undefined> {
  await load($);
  if (!state.task) return undefined;
  state.task = policy.onCheck(
    state.task,
    passed,
    start.startedAt,
    start.startPrint,
  );
  // The task's first failing check raises its levels once; later ones are the same work.
  const note =
    !passed && state.task.failed === 1
      ? await raise($, "a failing check")
      : undefined;
  await save($);
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
  const now = await $.clock.now();
  const p = await worktreePrint($);
  promptPrint = p;
  const build = BUILD.test(text);
  // A short reply ("ja") continues an open task; without one it is a request of its own, and
  // so is /build, however short.
  const thin = !!state.task && !build && isThin(text);
  const labels = await classifyPrompt($, text, kind, build, thin);
  const { change, verify, explore, ready } = labels;
  const step = policy.onPrompt({
    task: state.task,
    kind,
    change,
    build,
    thin,
    answering: endedOnQuestion,
    text,
    id: now,
    print: p,
  });
  endedOnQuestion = false;
  if (step.ended)
    await log($, endEntry(step.ended, ending(step.ended, p), now));
  state.task = step.task;
  const kept = ["continue", "escalate", "fold"].includes(step.event);
  const decided = await promptLevels($, {
    text,
    kind,
    change,
    verify,
    explore,
    ready,
    build,
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
      change: build ? "heavy" : change,
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
  gpt = false,
): Promise<string | undefined> {
  await load($);
  const now = await $.clock.now();
  const step = policy.onEdit(state.task, path, now, now, promptPrint, gpt);
  if (!step) return undefined;
  state.task = step.task;
  await save($);
  if (step.started)
    await log($, {
      task: state.task.id,
      event: "start",
      text: path,
      track: state.task.track,
      reason: "an edit outside any task",
    });
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

// GPT changed files through mcp__kit__delegate: they count as this chat's changes.
export async function flowDelegated($: EngineInterface, files: string[]) {
  for (const f of files) await flowEdit($, f, true, true);
}

// The turn wants to end: why it should go on, if it should.
export async function flowStop(
  $: EngineInterface,
  lastMessage: string | undefined,
): Promise<string | undefined> {
  await load($);
  const p = await worktreePrint($);
  // Code changed this turn with no task open (a shell edit, a subagent): git saw it.
  if (
    !state.task &&
    p !== undefined &&
    promptPrint !== undefined &&
    p !== promptPrint
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
  const before = state.task;
  const v = policy.stopVerdict(state.task, lastMessage, p);
  endedOnQuestion = (lastMessage ?? "").trim().endsWith("?");
  promptPrint = p; // the next turn's changes count from here
  state.task = v.task;
  await save($);
  const now = await $.clock.now();
  if (v.ended) await log($, endEntry(v.ended, "verified", now));
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

// After a compaction: what the open task still needs, for the recovery note.
export function flowRecovery(): string | undefined {
  if (!state.task || state.task.lastEditAt === 0) return undefined;
  const files = state.task.files.slice(0, 5).join(", ") || "code";
  const verifier =
    state.task.track === "heavy" && state.task.spec
      ? " and the kit:verifier on its spec"
      : "";
  const review =
    gateLevel(state.task) >= 2 ? " and an other-family review" : "";
  return `kit flow: an open ${state.task.track} task changed ${files}; before you finish, run the check that covers it${verifier}${review}.`;
}

// /clear: the open task ends here.
export async function resetFlow($: EngineInterface) {
  await load($);
  if (state.task)
    await log($, endEntry(state.task, "reset", await $.clock.now()));
  state.task = undefined;
  promptPrint = undefined;
  endedOnQuestion = false;
  await save($);
}

export function flow(on: On) {
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const check = checkOf(e.command);
    const start = check ? await flowCheckStart($) : undefined;
    const ran = await next(e);
    if (!start || !check || ran.deny !== undefined) return ran;
    const passed = checkPassed(check, ran.isError === true, ran.text ?? "");
    const note = await flowCheckEnd($, start, passed);
    return note ? { ...ran, context: [...(ran.context ?? []), note] } : ran;
  });

  on("command.run", { command: "flow" }, flowCommandRun);
}
