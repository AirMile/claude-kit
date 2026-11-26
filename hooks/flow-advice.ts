import type { CheckKind } from "./flow-check";
import type { Task } from "./flow-policy";

// What a hold advises the model to do, pure. flow-evidence.ts decides what is missing.

const RECOGNISED =
  "node --test, npm/pnpm/yarn test, vitest, jest, pytest, go test, cargo test, tsc, eslint, claude plugin test, build scripts";

export const noCheckNote = (t: Task): string =>
  `no command this task was recognised as a check${t.shellCalls ? ` (${t.shellCalls} shell command${t.shellCalls === 1 ? "" : "s"} ran, none a check)` : ""}`;

export const noCheckAdvice = `Recognised: ${RECOGNISED}. Run the project's test command through the Bash tool (the flow does not see PowerShell calls), or ask the user to add \`Test:\` to AGENTS.md § Commands; that command must start with one of the recognised runners, or it is ignored.`;

// The gate sees the whole checkout's fingerprint, so another session's edits hold this chat too.
// Shell edits are not recorded either: those stay this chat's to verify.
export const otherSession = (t: Task): string | undefined =>
  t.files.length
    ? undefined
    : "kit flow: no Edit, Write or delegated change by this chat is on record: if another session changed this checkout, say so and stop; changes made here by a shell command or any other tool, a subagent's too, still need the above.";

// Which file asks for it: a change in another repo is held to the session root's commands.
export const listedIn = (t: Task): string =>
  t.requiredRoot
    ? `${t.requiredRoot.replace(/[\\/]+$/, "")}/AGENTS.md`
    : "this project's AGENTS.md";

export const KIND_NAME: Record<CheckKind, string> = {
  test: "tests",
  static: "typecheck/lint",
  build: "the build",
};
export const KIND_RUN: Record<CheckKind, string> = {
  test: "test run",
  static: "typecheck/lint",
  build: "build",
};
