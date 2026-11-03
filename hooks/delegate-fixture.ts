import type { On } from "claude-code";
import type { TestBody } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
const NOW = Date.parse("2026-10-27T12:00:00Z");
const later = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const CATALOG = [
  "gpt-6.1-sol",
  "gpt-6-astra",
  "gpt-6.1-terra",
  "gpt-6-luna",
  "gpt-5.6-terra",
];

export function world(
  on: On,
  opts: {
    store?: Record<string, unknown>;
    status?: Record<string, unknown>; // what codex-status.js prints
    events?: string[]; // what Codex writes on stdout
  } = {},
) {
  const spawned: { argv: readonly string[]; input?: string }[] = [];
  const store: Record<string, unknown> = { ...opts.store };
  let gitCalls = 0;
  let statusReads = 0;
  on("session.root", async () => ({ value: "/p/app" }));
  on("ui.notice", async () => ({ value: undefined }));
  on("clock.now", async () => ({ value: NOW }));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("session.usage", async () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000, percent: 10 },
      rateLimits: [{ kind: "five_hour", percentUsed: 20, resetsAt: later(3) }],
    },
  }));
  on("process.run", async (_$, e) => {
    if (e.argv[0] === "node") {
      statusReads++;
      const status = opts.status ?? {
        argv: ["/bin/codex"],
        models: CATALOG.map((id) => ({ id })),
        limits: {
          five_hour: { pct: 1, resetsAt: later(4) },
          seven_day: { pct: 6, resetsAt: later(100) },
        },
      };
      return {
        value: {
          exitCode: 0,
          isStdoutTruncated: false,
          isStderrTruncated: false,
          stdout: `${JSON.stringify(status)}\n`,
          stderr: "",
        },
      };
    }
    if (e.argv[1] === "status") gitCalls++;
    return {
      value: {
        exitCode: 0,
        isStdoutTruncated: false,
        isStderrTruncated: false,
        stdout:
          e.argv[1] === "hash-object"
            ? "blob\n"
            : gitCalls > 1
              ? " M src/a.ts\0"
              : "",
        stderr: "",
      },
    };
  });
  on("process.spawn", async function* (_$, e) {
    spawned.push({ argv: e.argv, input: e.input });
    for (const line of opts.events ?? [])
      yield { stream: "stdout" as const, text: `${line}\n` };
    return { value: { code: 0, signal: null } };
  });
  return { spawned, store, reads: () => statusReads };
}

export async function delegate(
  $: Parameters<TestBody>[0],
  input: Record<string, unknown>,
) {
  const ran = await $.tool.call({
    tool: "mcp__kit__delegate",
    ...input,
  } as never);
  return String((ran as { result?: unknown }).result ?? JSON.stringify(ran));
}
