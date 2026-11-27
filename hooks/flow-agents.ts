import type { EngineInterface } from "claude-code";

import {
  parseReview,
  REVIEW_MARK,
  type Family,
  type ReviewRecord,
} from "./flow-evidence";
import {
  onReview,
  onVerifier,
  onNoReviewer,
  verifierPassed,
  type Task,
} from "./flow-policy";
import { state, load, save, taskPrint } from "./flow-state";

// taskId: the task open at the start; an answer for another task's work is dropped. No task
// then: it counts for the task the work starts (a verifier's first edit may create it).
export type ReviewStart = {
  print: string | undefined;
  at: number;
  taskId?: number;
};
type Spawn = ReviewStart & { kind: "verifier" | "review" };
const otherTask = (task: Task, start: ReviewStart) =>
  start.taskId !== undefined && start.taskId !== task.id;
const spawned = new Map<string, Spawn>();

// Both kinds bind their answer to the code and clock at spawn, never at completion.
export async function flowSpawned(
  $: EngineInterface,
  agentId: string | undefined,
  type: string,
  prompt: string,
) {
  const kind =
    type === "kit:verifier"
      ? "verifier"
      : prompt.includes(REVIEW_MARK)
        ? "review"
        : undefined;
  if (!agentId || !kind) return;
  await load($);
  const taskId = state.task?.id; // the task at spawn, before any await
  spawned.set(agentId, {
    kind,
    print: await taskPrint($),
    at: await $.clock.now(),
    taskId,
  });
}

function agentAnswer(
  task: Task | undefined,
  agentId: string,
  answer: string,
): Task | undefined {
  const start = spawned.get(agentId);
  spawned.delete(agentId);
  if (!task || !start || otherTask(task, start)) return undefined;
  return start.kind === "verifier"
    ? onVerifier(task, verifierPassed(answer), start.at, start.print)
    : onReview(task, reviewRecord(start, "claude", answer));
}

function reviewRecord(
  start: ReviewStart,
  family: Family,
  answer: string,
  error?: string,
): ReviewRecord {
  const parsed = parseReview(answer);
  return {
    print: start.print,
    at: start.at,
    family,
    ...(error !== undefined && parsed.outcome !== "fail"
      ? ({ outcome: "error", depth: false, error } as const)
      : parsed),
  };
}

// A subagent's answer uses the print and time captured by flow-agents.ts.
export async function flowAnswer(
  $: EngineInterface,
  agentId: string,
  answer: string,
) {
  await load($);
  const answered = agentAnswer(state.task, agentId, answer);
  if (answered) {
    state.task = answered;
    await save($);
  }
}

export async function flowReviewStart(
  $: EngineInterface,
): Promise<ReviewStart | undefined> {
  await load($);
  if (!state.task) return undefined;
  const taskId = state.task.id; // read before the awaits below
  return {
    print: await taskPrint($),
    at: await $.clock.now(),
    taskId,
  };
}

export async function flowReviewEnd(
  $: EngineInterface,
  start: ReviewStart | undefined,
  family: Family,
  answer: string,
  error?: string,
) {
  await load($);
  if (!state.task || !start || otherTask(state.task, start)) return;
  state.task = onReview(state.task, reviewRecord(start, family, answer, error));
  await save($);
}

export async function flowNoReviewer($: EngineInterface, reason: string) {
  await load($);
  if (!state.task) return;
  state.task = onNoReviewer(state.task, reason, await taskPrint($));
  await save($);
}
