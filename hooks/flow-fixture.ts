import type { On, ToolCallResult } from "claude-code";
import type { TestBody } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
// `git`: src/a.ts's blob in git's index and in the worktree; absent, no git and flow goes by
// tool calls. A commit makes the index the worktree's.
function result(value: unknown, failed: boolean): ToolCallResult {
  return failed ? { result: value, isError: true } : { result: value };
}

export function world(
  on: On,
  store: Record<string, unknown> = {},
  git?: { index: string; work: string },
) {
  let now = Date.parse("2026-10-27T12:00:00Z");
  on("session.id", async () => ({ value: "s1" }));
  on("clock.now", async () => ({ value: now }));
  on("clock.after", async () => ({ value: undefined }));
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.usage", async () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000, percent: 10 },
      rateLimits: [],
    },
  }));
  on("ui.log", async () => ({ value: undefined }));
  on("classic.Stop", async () => ({}));
  on("ui.invalidate", async () => ({ value: undefined }));
  on("process.run", async (_$, e) => {
    const [cmd, sub, flag] = e.argv;
    if (!git || cmd !== "git")
      return {
        value: {
          exitCode: 1,
          stdout: "",
          stderr: "",
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      };
    const edited = git.work !== git.index;
    const stdout =
      sub === "ls-files"
        ? flag === "-s"
          ? `100644 ${git.index} 0\tsrc/a.ts\n`
          : ""
        : sub === "diff"
          ? edited
            ? "M\tsrc/a.ts\n"
            : ""
          : sub === "hash-object"
            ? `${git.work}\n`
            : "";
    return {
      value: {
        exitCode: 0,
        stdout,
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("tool.call", { tool: ["Edit", "Write"] }, async (_$, e) =>
    result(
      { type: "update" },
      (e as { file_path: string }).file_path.includes("broken"),
    ),
  );
  on("tool.call", { tool: "Bash" }, async (_$, e) =>
    result({ stdout: "", stderr: "" }, e.command.includes("fail")),
  );
  return { store, later: (ms: number) => (now += ms) };
}

type T$ = Parameters<TestBody>[0];
export const write = ($: T$, path: string) =>
  $.tool.call({ tool: "Write", file_path: path, content: "x" } as never);
export const bash = ($: T$, command: string) =>
  $.tool.call({ tool: "Bash", command } as never);
export const stop = async ($: T$, last = "Done.") =>
  (await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: last,
    background_tasks: [],
  } as never)) as { block?: string };
