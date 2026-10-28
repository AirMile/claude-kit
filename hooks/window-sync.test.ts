import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
const NOW = Date.parse("2026-10-28T12:00:00Z");
const later = (min: number) => new Date(NOW + min * 60_000).toISOString();
const CATALOG = ["gpt-6.1-sol", "gpt-6-luna", "gpt-5.6-luna", "gpt-6.1-terra"];
const IDLE = { pct: 0, resetsAt: later(300) };
const RUNNING = { pct: 12, resetsAt: later(120) };

function world(
  on: On,
  opts: {
    store?: Record<string, unknown>;
    gpt?: (typeof IDLE)[]; // ChatGPT's 5h window per status read, the last one repeating
    models?: string[];
    code?: number; // Codex's exit code
    hang?: boolean; // Codex never answers
    deadline?: boolean; // timers fire at once
    late?: boolean; // timers fire after 50 ms
    missing?: boolean; // Codex not found
  } = {},
) {
  const spawned: { argv: readonly string[]; input?: string }[] = [];
  const toasts: string[] = [];
  const store: Record<string, unknown> = { ...opts.store };
  const windows = opts.gpt ?? [IDLE, { pct: 1, resetsAt: later(300) }];
  let reads = 0;
  on("session.root", async () => ({ value: "/p/app" }));
  on("clock.now", async () => ({ value: NOW }));
  on("clock.after", () =>
    opts.deadline
      ? Promise.resolve({ value: undefined })
      : opts.late
        ? new Promise((r) => setTimeout(() => r({ value: undefined }), 50))
        : new Promise<never>(() => {}),
  );
  on("ui.toast", async (_$, e) => {
    toasts.push(String(e.text));
    return { value: undefined };
  });
  on("ui.invalidate", async () => ({ value: undefined }));
  on("session.measure", async (_$, e) => ({ changed: e.changed }));
  on("store.get", async (_$, e) => ({ value: store[e.key] }));
  on("store.set", async (_$, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("process.run", async () => {
    const five_hour = windows[Math.min(reads, windows.length - 1)];
    reads++;
    const status = {
      ...(opts.missing ? { error: "codex not found" } : {}),
      argv: opts.missing ? null : ["/bin/codex"],
      models: (opts.models ?? CATALOG).map((id) => ({ id })),
      limits: { five_hour, seven_day: { pct: 6, resetsAt: later(6000) } },
    };
    return {
      value: { exitCode: 0, stdout: `${JSON.stringify(status)}\n`, stderr: "" },
    };
  });
  on("process.spawn", async function* (_$, e) {
    spawned.push({ argv: e.argv, input: e.input });
    if (opts.hang) await new Promise<never>(() => {});
    yield {
      stream: "stdout" as const,
      text: `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "ok" } })}\n`,
    };
    return { value: { code: opts.code ?? 0, signal: null } };
  });
  return { spawned, toasts, store, reads: () => reads };
}

// A Claude 5h window in use that started `ago` minutes ago.
const measure = (ago = 10, percentUsed = 3) =>
  ({
    context: { percent: 10, tokens: 20_000 },
    rateLimits: [
      { kind: "five_hour", percentUsed, resetsAt: later(300 - ago) },
    ],
    changed: ["rateLimits"],
  }) as never;

const settle = async (done: () => boolean = () => false) => {
  for (let i = 0; i < 25 && !done(); i++)
    await new Promise((r) => setTimeout(r, 20));
};

const gptText = async ($: Parameters<Parameters<typeof test>[1]>[0]) =>
  String(
    (
      (await $.command.run({ command: "gpt", args: "" } as never)) as {
        text?: string;
      }
    ).text,
  );

test("a new Claude window with ChatGPT's idle sends one Luna ping and shows one toast", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure());
  await settle(() => w.toasts.length > 0);
  expect(w.spawned.length).toBe(1);
  const argv = w.spawned[0]!.argv;
  expect(argv.slice(0, 2)).toEqual(["/bin/codex", "exec"]);
  expect(argv).toContain("--ephemeral");
  expect(argv).toContain("gpt-6-luna");
  expect(argv).toContain('model_reasoning_effort="low"');
  expect(argv).toContain("read-only");
  expect(w.spawned[0]!.input).toBe("Reply with: ok");
  expect(w.toasts.filter((t) => t.includes("both reset at")).length).toBe(1);
  expect(w.store.windowSync).toMatchObject({
    start: NOW - 10 * 60_000,
    at: NOW,
    ok: true,
  });
  expect(await gptText($)).toContain("window sync: ");
  expect(await gptText($)).not.toContain("failed");
});

test("one ping per Claude window: a second measure sends none", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure());
  await settle(() => w.toasts.length > 0);
  await $.session.measure(measure(12, 4));
  await settle();
  expect(w.spawned.length).toBe(1);
});

test("a start stored by another session or before a restart sends none", async ($, on) => {
  const w = world(on, {
    store: { windowSync: { start: NOW - 10 * 60_000, at: NOW, ok: true } },
  });
  await $.session.measure(measure());
  await settle();
  expect(w.spawned.length).toBe(0);
  expect(w.reads()).toBeLessThan(2);
});

test("no ping while ChatGPT's window runs, for an old Claude window, or without a reading", async ($, on) => {
  const w = world(on, { gpt: [RUNNING] });
  await $.session.measure(measure());
  await settle();
  expect(w.spawned.length).toBe(0);
  await $.session.measure(measure(40));
  await $.session.measure({
    context: { percent: 10, tokens: 20_000 },
    rateLimits: [],
    changed: ["rateLimits"],
  } as never);
  await settle();
  expect(w.spawned.length).toBe(0);
  expect(w.toasts.length).toBe(0);
});

test("GPT off: no ping, no Codex read and no message", async ($, on) => {
  const off = world(on, { store: { gpt: false } });
  await $.session.measure(measure());
  await settle();
  expect(off.spawned.length).toBe(0);
  expect(off.reads()).toBe(0);
  expect(off.toasts.length).toBe(0);
});

test("without Luna in the catalog there is no ping and no message", async ($, on) => {
  const w = world(on, { models: ["gpt-6.1-sol", "gpt-6.1-terra"] });
  await $.session.measure(measure());
  await settle();
  expect(w.spawned.length).toBe(0);
  expect(w.toasts.length).toBe(0);
  expect(await gptText($)).toContain("window sync: —");
});

test("a failing ping is recorded for /gpt and not retried in that window", async ($, on) => {
  const w = world(on, { code: 1 });
  await $.session.measure(measure());
  await settle(() => (w.store.windowSync as { ok?: boolean })?.ok === false);
  expect(w.store.windowSync).toMatchObject({ ok: false });
  expect(w.toasts.length).toBe(0);
  expect(await gptText($)).toContain("window sync: failed at ");
  await $.session.measure(measure(12, 4));
  await settle();
  expect(w.spawned.length).toBe(1);
});

test("a ping past its deadline is stopped and counts as failed", async ($, on) => {
  const w = world(on, { deadline: true });
  await $.session.measure(measure());
  await settle(() => (w.store.windowSync as { ok?: boolean })?.ok === false);
  expect(w.store.windowSync).toMatchObject({ ok: false });
  expect(w.toasts.length).toBe(0);
});

test("the measure returns while the ping still runs", async ($, on) => {
  const w = world(on, { hang: true });
  await $.session.measure(measure());
  await settle(() => w.spawned.length > 0);
  expect(w.spawned.length).toBe(1);
  expect(w.store.windowSync).toMatchObject({ start: NOW - 10 * 60_000 });
  expect((w.store.windowSync as { ok?: boolean }).ok).toBe(undefined);
});

test("a silent Codex is stopped at the deadline: failed, no toast, and the next window can sync", async ($, on) => {
  const w = world(on, { hang: true, late: true });
  await $.session.measure(measure());
  await settle(() => (w.store.windowSync as { ok?: boolean })?.ok === false);
  expect(w.store.windowSync).toMatchObject({ ok: false });
  expect(w.toasts.length).toBe(0);
  expect(await gptText($)).toContain("window sync: failed at ");
});

test("Codex missing or not logged in: no ping and no message", async ($, on) => {
  const w = world(on, { missing: true });
  await $.session.measure(measure());
  await settle();
  expect(w.spawned.length).toBe(0);
  expect(w.toasts.length).toBe(0);
  expect(w.store.windowSync).toBe(undefined);
});
