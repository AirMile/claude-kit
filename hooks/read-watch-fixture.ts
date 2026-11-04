import type { On } from "claude-code";
import { labelAnswer } from "./label-fixture";
import { CHANGE_LABELS } from "./flow-policy";
import { LABELS } from "./model-policy";

// Drive the installed mod through prompts and tools; never pass the test's $ to a module.
export function world(
  on: On,
  opts: {
    explore?: boolean;
    change?: boolean;
    off?: boolean;
    delegate?: "ok" | "claude" | "failed" | "partial" | "none";
    runTask?: "pass" | "failing" | "stopped" | "not run";
  } = {},
) {
  const store: Record<string, unknown> = { mode: "off", gpt: !opts.off };
  const prompts: { context?: readonly string[] }[] = [];
  const classified: {
    text: string;
    labels: readonly string[];
    model?: string;
  }[] = [];
  const completed: { prompt: string; model: string }[] = [];
  const resetsAt = "2026-11-03T12:00:00Z";
  let gptPct = 10;
  let elapsed = 0;
  on("session.id", async () => ({ value: "s1" }));
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.usage", async () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, percent: 10 },
      rateLimits: [],
    },
  }));
  on("session.measure", async (_$, e) => ({ changed: e.changed }));
  on("clock.now", async () => ({
    value: Date.parse("2026-10-27T12:00:00Z") + elapsed,
  }));
  on("ui.log", async () => ({ value: undefined }));
  on("ui.invalidate", async () => ({ value: undefined }));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("model.classify", async (_$, e) => {
    classified.push({
      text: e.text,
      labels: e.labels,
      model: e.options?.model,
    });
    return { value: opts.change ? LABELS.routine : LABELS.question };
  });
  on("model.complete", async (_$, e) => {
    completed.push({ prompt: String(e.prompt), model: e.model });
    return labelAnswer(e.prompt, {
      change: opts.change ? CHANGE_LABELS.medium : CHANGE_LABELS.none,
      explore: opts.explore,
    });
  });
  on("process.run", async (_$, e) => ({
    value: {
      isStdoutTruncated: false,
      isStderrTruncated: false,
      ...(e.argv[0] === "/cover"
        ? {
            exitCode: opts.runTask === "pass" ? 0 : 1,
            stdout: "check output",
            stderr: "",
          }
        : e.argv[0] === "node"
          ? {
              exitCode: 0,
              stdout: JSON.stringify({
                argv: ["/bin/codex"],
                models: opts.runTask
                  ? [{ id: "gpt-6.1-terra" }]
                  : opts.delegate
                    ? [{ id: "gpt-6-luna" }]
                    : [],
                limits: {
                  five_hour: { pct: 10 },
                  seven_day: { pct: gptPct, resetsAt },
                },
              }),
              stderr: "",
            }
          : { exitCode: 1, stdout: "", stderr: "" }),
    },
  }));
  on("process.spawn", async function* () {
    elapsed += 50;
    if (opts.runTask)
      yield {
        stream: "stdout" as const,
        text:
          JSON.stringify({ type: "thread.started", thread_id: "t-watch" }) +
          "\n",
      };
    if (opts.delegate !== "failed")
      yield {
        stream: "stdout" as const,
        text:
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: "Done." },
          }) + "\n",
      };
    if (
      opts.delegate === "failed" ||
      opts.delegate === "partial" ||
      opts.runTask === "stopped"
    )
      yield {
        stream: "stdout" as const,
        text:
          JSON.stringify({
            type: "turn.failed",
            error: { message: "offline" },
          }) + "\n",
      };
    return { value: { code: 0, signal: null } };
  });
  on("clock.after", async () => new Promise<never>(() => {}));
  on("prompt.submit", async (_$, e) => {
    prompts.push({ context: e.context });
    return { text: e.text };
  });
  on(
    "tool.call",
    { tool: ["Read", "Grep", "Glob", "Bash", "Edit", "Write"] },
    async (_$, e) => ({
      result: "ok" as never,
      ...(e.tool === "Read" && e.file_path.includes("broken")
        ? { isError: true as const }
        : {}),
      text: "x".repeat(e.tool === "Read" ? (e.limit ?? 1) : 1),
      context: ["existing context"],
    }),
  );
  return {
    store,
    prompts,
    classified,
    completed,
    resetsAt,
    gpt: (pct: number) => {
      gptPct = pct;
    },
  };
}
