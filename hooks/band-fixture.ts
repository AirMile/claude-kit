import type { On } from "claude-code";
import type { TestBody } from "claude-code/testing";

// The world beneath the band for its rings: Claude's and ChatGPT's limits, and agy answering
// `/usage`. kit's own mod is loaded around the test.
const NOW = Date.parse("2026-10-27T12:00:00Z");

const bucket = (bucketId: string, left: number, reset_time: string) => ({
  id: bucketId,
  remaining_fraction: left,
  reset_time,
});

export const AGY_USAGE = JSON.stringify({
  status: "SUCCESS",
  command: {
    name: "usage",
    data: {
      groups: [
        {
          name: "Gemini Models",
          buckets: [
            bucket("gemini-weekly", 0.7544, "2026-11-01T12:00:00Z"),
            bucket("gemini-5h", 0.948, "2026-10-27T15:00:00Z"),
          ],
        },
        {
          name: "Claude and GPT models",
          buckets: [bucket("3p-weekly", 0, "2026-11-01T12:00:00Z")],
        },
      ],
    },
  },
});

export function bandWorld(
  on: On,
  opts: {
    usage?: string;
    surface?: "terminal" | "desktop";
    store?: Record<string, unknown>;
    brokenWrite?: string; // writing this store key fails
  } = {},
) {
  const store: Record<string, unknown> = { ...opts.store };
  const asked: (readonly string[])[] = []; // every `agy /usage` run
  const clock = { now: NOW };
  const out = (stdout: string) => ({
    value: {
      exitCode: 0,
      isStdoutTruncated: false,
      isStderrTruncated: false,
      stdout,
      stderr: "",
    },
  });
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.id", async () => ({ value: "s1" }));
  on("session.model", async () => ({ value: "claude-sonnet-5-5" }));
  on("session.turns", async () => ({ value: 0 }));
  on("session.usage", async () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000, percent: 10 },
      rateLimits: [
        { kind: "five_hour", percentUsed: 6, resetsAt: "2026-10-27T16:25:00Z" },
        { kind: "seven_day", percentUsed: 35, resetsAt: "2026-11-01T01:00:00Z" },
      ],
    },
  }));
  on("clock.now", async () => ({ value: clock.now }));
  on("clock.after", async () => ({ value: undefined }));
  on("clock.every", () => new Promise<never>(() => {}));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    if (e.key === opts.brokenWrite) throw new Error("store broke");
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("session.surfaces", async () => ({ value: [opts.surface ?? "desktop"] }));
  on("ui.toast", async () => ({ value: undefined }));
  on("ui.log", async () => ({ value: undefined }));
  on("fs.exists", async () => ({ value: true }));
  on("session.measure", async (_$, e) => ({ changed: e.changed }));
  on("process.run", async (_$, e) => {
    if (String(e.argv[1]).endsWith("agy-find.js")) return out("/bin/agy\n");
    if (String(e.argv[1]).endsWith("codex-status.js"))
      return out(
        `${JSON.stringify({
          argv: ["/bin/codex"],
          models: [],
          limits: {
            five_hour: { pct: 10, resetsAt: "2026-10-27T14:00:00Z" },
            seven_day: { pct: 22, resetsAt: "2026-10-30T12:00:00Z" },
          },
        })}\n`,
      );
    if (e.argv.includes("--print=/usage")) {
      asked.push(e.argv);
      return out(opts.usage ?? AGY_USAGE);
    }
    return out("");
  });
  return { asked, clock, store };
}

export const measure = ($: Parameters<TestBody>[0]) =>
  $.session.measure({
    context: { window: 200_000, percent: 10, tokens: 20_000 },
    rateLimits: [
      { kind: "five_hour", percentUsed: 6, resetsAt: "2026-10-27T16:25:00Z" },
      { kind: "seven_day", percentUsed: 35, resetsAt: "2026-11-01T01:00:00Z" },
    ],
    changed: ["rateLimits"],
  } as never);

export const mountBand = (
  $: Parameters<TestBody>[0],
  surface: "terminal" | "desktop",
) =>
  $.ui.mount({
    plugin: "kit",
    surface,
    component: "AbovePrompt",
    props: { hasSurvey: false } as never,
  });
