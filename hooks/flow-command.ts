import type { CommandSpec, EngineInterface } from "claude-code";

import { openLine } from "./flow-evidence";
import { load, state } from "./flow-state";
import { type Mark, MARKS, marked, report } from "./flow-log";
import { readLog, worktreePrint, writeLog } from "./flow-store";

export const flowCommand: CommandSpec = {
  name: "flow",
  description: "kit: the change workflow's report, and marking a pick",
  argumentHint: "[mark <n> too-heavy|too-light|hold-right|hold-wrong]",
  immediate: true,
};

export async function flowCommandRun($: EngineInterface, e: { args: string }) {
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
  await load($);
  const open = openLine(state.task, await worktreePrint($));
  return {
    text: open + "\n" + note + report(await readLog($)),
  };
}
