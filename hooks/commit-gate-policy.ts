import { changed, missing, roundOf, verified } from "./flow-evidence";
import type { Task } from "./flow-policy";

// The commit gate, pure: a `git commit` while the open medium or heavy task is not verified on
// the current code. The evidence is the Stop gate's (flow-evidence.ts), so nothing is re-run.

const GIT_GLOBAL = String.raw`(?:\s+(?:-[cC]\s+\S+|--(?:git-dir|work-tree|namespace|exec-path|config-env)\s+\S+|--[\w-]+(?:=\S+)?|-[a-zA-Z]))*`;
const WRAPPER = String.raw`(?:(?:command|time|exec|sudo|nohup)\s+)*`;
const COMMIT = new RegExp(
  String.raw`(?:^|[;&|(\n]\s*|\b(?:then|do|else)\s+)(?:\w+=\S*\s+)*${WRAPPER}git(?:\.exe)?${GIT_GLOBAL}\s+commit(?=[\s;&|)]|$)`,
  "g",
);

// What the shell runs, not what it prints: line continuations joined, heredoc bodies and quoted
// strings (a commit message that mentions `--dry-run`, a script that contains `git commit`)
// blanked first.
const bare = (command: string): string =>
  command
    .replace(/\\\r?\n/g, " ")
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, "")
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');

// Some commit in the command is a real one: a `--dry-run` only excuses the commit it belongs to.
export const isCommit = (command: string): boolean => {
  const text = bare(command);
  for (const m of text.matchAll(COMMIT)) {
    const rest = text.slice((m.index ?? 0) + m[0].length).split(/[;&|\n]/)[0] ?? "";
    if (!/--dry-run/.test(rest)) return true;
  }
  return false;
};

// Why this commit should wait, or undefined when it may go: no task, a light one, a verified
// one, a waived one, or work whose only missing piece is a review no reviewer can give.
export function commitBlock(
  task: Task | undefined,
  print: string | undefined,
): string | undefined {
  if (!task || task.track === "light" || task.stopAsked) return undefined;
  if (!changed(task, print) || verified(task, print)) return undefined;
  const review = task.noReviewer?.round !== roundOf(task, print);
  const wants = missing(task, print).filter(
    (item) => review || !item.startsWith("a review:"),
  );
  if (!wants.length) return undefined;
  return (
    `kit commit gate: this ${task.track} task still needs ${wants.join("; ")} before it is committed. ` +
    'Run that first, then commit. The user can say "skip verify" or run /commitgate off.'
  );
}
