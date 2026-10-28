import type { CommandSpec, EngineInterface, On } from "claude-code";

import { checkOf, checkPassed } from "./flow-check";
import { classifyPrompt } from "./flow-prompt";
import {
  endEntry,
  type Ending,
  type Mark,
  MARKS,
  marked,
  report,
} from "./flow-log";
import {
  changed,
  newTask,
  onCheck,
  onEdit,
  onPrompt,
  onVerifier,
  stopVerdict,
  type Task,
  verified,
  verifierPassed,
} from "./flow-policy";
import {
  loadTask,
  log,
  readLog,
  saveTask,
  worktreePrint,
  writeLog,
} from "./flow-store";
import { isThin, type Kind } from "./model-policy";
import { readTurn } from "./read-watch";

// Flow (always on; /flow reports it): this chat's open change task, fed by its prompts
// (auto-model.ts), edits, turn ends and compactions (register.tsx, compaction.ts), shell
// checks (below), the verifier's answer (fresh-start.ts's turn.complete) and GPT's changes
// (delegate.ts). The worktree's git fingerprint is the evidence; the task is kept per session
// in $.store, so a reload or restart keeps it. It sends the track's notes, holds a turn that
// ends on unchecked changes, and logs it all for 14 days.

export const flowCommand: CommandSpec = {
  name: "flow",
  description: "kit: the change workflow's report, and marking a pick",
  argumentHint: "[mark <n> too-heavy|too-light|hold-right|hold-wrong]",
  immediate: true,
};

const BUILD =
  /^\s*\/(kit:)?build\b|<command-name>\/?(kit:)?build<\/command-name>/;

let loadedFor: string | undefined; // the session whose task is in memory
let task: Task | undefined; // this chat's open change task
let promptPrint: string | undefined; // the worktree when the last prompt came in
let endedOnQuestion = false; // the last turn ended on a question to the user
const spawned = new Map<string, string>(); // subagent id → its type, until it answers

// The task of this session, from $.store the first time (a reload or restart keeps it).
async function load($: EngineInterface) {
  const id = await $.session.id().catch(() => "");
  if (loadedFor === id) return;
  loadedFor = id;
  task = await loadTask($, id);
}

async function save($: EngineInterface) {
  await saveTask($, loadedFor ?? (await $.session.id().catch(() => "")), task);
}

const ending = (t: Task, p: string | undefined): Ending =>
  !changed(t, p)
    ? "no change"
    : verified(t, p)
      ? "verified"
      : t.unverified
        ? "unverified"
        : "unresolved";

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
  // A short reply ("ja") continues an open task; without one it is a request of its own.
  const thin = !!task && isThin(text);
  const { change, note } = await classifyPrompt($, text, kind, build, thin);
  const step = onPrompt({
    task,
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
  task = step.task;
  await save($);
  if (step.event === "start" || step.event === "escalate")
    await log($, {
      task: task?.id,
      event: step.event,
      text: text.trim().slice(0, 60),
      track: task?.track,
      kind,
      change: build ? "heavy" : change,
      reason:
        step.event === "escalate" ? "the prompt asked for more" : undefined,
    });
  return [step.note, note].filter(Boolean).join("\n") || undefined;
}

// A file written or edited, by this chat or one of its subagents: the note for the tool's
// result when the task grew (the main chat's only: a subagent's note would reach the wrong
// reader).
export async function flowEdit(
  $: EngineInterface,
  path: string,
  fromAgent = false,
): Promise<string | undefined> {
  await load($);
  const now = await $.clock.now();
  const step = onEdit(task, path, now, now, promptPrint);
  if (!step) return undefined;
  task = step.task;
  await save($);
  if (step.started)
    await log($, {
      task: task.id,
      event: "start",
      text: path,
      track: task.track,
      reason: "an edit outside any task",
    });
  if (!step.note) return undefined;
  await log($, {
    task: task.id,
    event: "escalate",
    text: path,
    track: task.track,
    reason: `${task.files.length} files`,
  });
  return fromAgent ? undefined : step.note;
}

// GPT changed files through mcp__kit__delegate: they count as this chat's changes.
export async function flowDelegated($: EngineInterface, files: string[]) {
  for (const f of files) await flowEdit($, f, true);
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
    !task &&
    p !== undefined &&
    promptPrint !== undefined &&
    p !== promptPrint
  ) {
    const now = await $.clock.now();
    task = newTask(now, "light", promptPrint);
    await log($, {
      task: task.id,
      event: "start",
      text: "",
      track: "light",
      reason: "changes git saw",
    });
  }
  const before = task;
  const v = stopVerdict(task, lastMessage, p);
  endedOnQuestion = (lastMessage ?? "").trim().endsWith("?");
  promptPrint = p; // the next turn's changes count from here
  task = v.task;
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

// A subagent this chat started (auto-model.ts's agent.spawn), until its answer comes.
export function flowSpawned(agentId: string | undefined, type: string) {
  if (agentId && type === "kit:verifier") spawned.set(agentId, type);
}

// A subagent's turn ended (turn.complete): the verifier's PASS or FAIL counts for the task.
export async function flowAnswer(
  $: EngineInterface,
  agentId: string,
  answer: string,
) {
  if (!spawned.delete(agentId)) return;
  await load($);
  if (!task) return;
  task = onVerifier(
    task,
    verifierPassed(answer),
    await $.clock.now(),
    await worktreePrint($),
  );
  await save($);
}

// After a compaction: what the open task still needs, for the recovery note.
export function flowRecovery(): string | undefined {
  if (!task || task.lastEditAt === 0) return undefined;
  const files = task.files.slice(0, 5).join(", ") || "code";
  const verifier =
    task.track === "heavy" && task.spec
      ? " and the kit:verifier on its spec"
      : "";
  return `kit flow: an open ${task.track} task changed ${files}; before you finish, run the check that covers it${verifier}.`;
}

// /clear: the open task ends here.
export async function resetFlow($: EngineInterface) {
  await load($);
  if (task) await log($, endEntry(task, "reset", await $.clock.now()));
  task = undefined;
  promptPrint = undefined;
  endedOnQuestion = false;
  await save($);
}

export function flow(on: On) {
  // A check counts for the worktree it started on, whoever ran it (a subagent's too).
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const check = checkOf(e.command);
    if (check) await load($);
    const watch = check && task;
    const startedAt = watch ? await $.clock.now() : 0;
    const startPrint = watch ? await worktreePrint($) : undefined;
    const ran = await next(e);
    if (!watch || !check || ran.deny !== undefined || !task) return ran;
    task = onCheck(
      task,
      checkPassed(check, ran.isError === true, ran.text ?? ""),
      startedAt,
      startPrint,
    );
    await save($);
    return ran;
  });

  on("command.run", { command: "flow" }, async ($, e) => {
    const [verb, n, what] = e.args.trim().toLowerCase().split(/\s+/);
    let note = "";
    if (verb === "mark") {
      const next = MARKS.includes(what as Mark)
        ? marked(await readLog($), Number(n), what as Mark)
        : undefined;
      if (next) await writeLog($, next);
      note = next
        ? `Marked ${n} as ${what}.\n`
        : `No mark: /flow mark <n> ${MARKS.join("|")}.\n`;
    }
    return {
      text: note + report(await readLog($)),
    };
  });
}
