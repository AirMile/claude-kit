import type { On, ProcessRunInit } from "claude-code";
import { newTask } from "./flow-policy";
import { CHECK_MS } from "./task-runner-policy";

// Drive the installed mod; bottom hooks stand in for Codex, git and host checks.
export function world(
  on: On,
  opts: {
    codes?: number[];
    off?: boolean;
    missing?: boolean;
    claude?: boolean;
    failRound?: number;
    checkError?: "timeout" | "start";
    failRoot?: boolean;
    buildMs?: number;
    checkMs?: number;
    flow?: boolean;
    hold?: "root" | "check";
  } = {},
) {
  let now = Date.parse("2026-10-27T12:00:00Z");
  let roots = 0;
  const spawned: { argv: readonly string[]; input?: string }[] = [];
  const checks: { argv: readonly string[]; init?: ProcessRunInit }[] = [];
  const notices: string[] = [];
  const task = {
    ...newTask(now, "medium"),
    levels: { d: 1, e: 1, v: 1, r: 0 },
  };
  const store: Record<string, unknown> = {
    gpt: !opts.off,
    ...(opts.flow ? { flowTasks: { s1: task } } : {}),
  };
  let releaseRoot!: () => void;
  let enteredRoot!: () => void;
  const held = new Promise<void>((r) => {
    releaseRoot = r;
  });
  const entered = new Promise<void>((r) => {
    enteredRoot = r;
  });
  on("session.id", async () => ({ value: "s1" }));
  on("session.root", async () => {
    if (++roots === 1) {
      if (opts.hold === "root") {
        enteredRoot();
        await held;
      }
      if (opts.failRoot) throw new Error("root unavailable");
    }
    return { value: "/p/app" };
  });
  on("clock.now", async () => ({ value: now }));
  on("clock.after", async () => new Promise<never>(() => {}));
  on("session.usage", async () => ({
    value: {
      startedAt: now,
      context: { window: 200000, percent: 10 },
      rateLimits: [],
    },
  }));
  on("ui.notice", async (_$, e) => {
    notices.push(e.text ?? "");
    return { value: undefined };
  });
  on("ui.log", async () => ({ value: undefined }));
  on("ui.invalidate", async () => ({ value: undefined }));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  const result = (exitCode: number, stdout = "", stderr = "") => ({
    value: {
      exitCode,
      stdout,
      stderr,
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  });
  on("process.run", async (_$, e) => {
    if (e.argv[0] === "node")
      return result(
        0,
        JSON.stringify({
          argv: opts.missing ? null : ["/bin/codex"],
          state: opts.missing ? "missing" : "ready",
          models: opts.missing
            ? []
            : [{ id: "gpt-6.1-terra" }, { id: "gpt-6.1-sol" }],
          limits: {
            five_hour: { pct: opts.claude ? 99 : 1 },
            seven_day: { pct: 1 },
          },
        }),
      );
    if (e.argv[0] === "git")
      return result(
        0,
        e.argv[1] === "status" && spawned.length
          ? ` M src/r${spawned.length}.ts\0`
          : e.argv[1] === "hash-object"
            ? `blob-${spawned.length}\n`
            : e.argv[1] === "ls-files" && e.argv[2] === "-s"
              ? `100644 blob-${checks.length} 0\tsrc/a.ts\n`
              : "",
      );
    checks.push({ argv: e.argv, init: e.init });
    now += opts.checkMs ?? 0;
    if (opts.hold === "check" && checks.length === 1) {
      enteredRoot();
      await held;
    }
    if (opts.checkError && checks.length === 1) {
      if (opts.checkError === "timeout") now += e.init?.timeoutMs ?? CHECK_MS;
      throw new Error(
        opts.checkError === "timeout" ? "process timed out" : "ENOENT",
      );
    }
    return result(
      opts.codes?.[checks.length - 1] ?? 0,
      Array.from({ length: 65 }, (_, i) => `line ${i}`).join("\n") + "\n",
      "stderr tail",
    );
  });
  on("process.spawn", async function* (_$, e) {
    spawned.push({ argv: e.argv, input: e.input });
    now += opts.buildMs ?? 0;
    const events = [
      { type: "thread.started", thread_id: "t-run" },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "Done." },
      },
      ...(opts.failRound === spawned.length
        ? [{ type: "turn.failed", error: { message: "Codex offline" } }]
        : []),
      { type: "turn.completed" },
    ];
    for (const ev of events)
      yield { stream: "stdout" as const, text: JSON.stringify(ev) + "\n" };
    return { value: { code: 0, signal: null } };
  });
  return { spawned, checks, store, notices, entered, releaseRoot };
}
