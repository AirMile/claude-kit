import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
test("Codex missing, then logged in: state follows, looks again after 30 s and toasts once when ready", async ($, on) => {
  let now = Date.parse("2026-10-28T12:00:00Z");
  const answers = [
    { argv: null, state: "missing", error: "codex not found" },
    { argv: ["/bin/codex"], state: "login", error: "not logged in" },
    { argv: ["/bin/codex"], state: "ready" },
  ];
  let reads = 0;
  const toasts: string[] = [];
  on("session.root", async () => ({ value: "/p/app" }));
  on("clock.now", async () => ({ value: now }));
  on("ui.toast", async (_$, e) => {
    toasts.push(String(e.text));
    return { value: undefined };
  });
  on("ui.invalidate", async () => ({ value: undefined }));
  on("session.measure", async (_$, e) => ({ changed: e.changed }));
  on("store.get", async () => ({ value: undefined }));
  on("store.set", async () => ({ value: undefined }));
  on("process.run", async () => {
    const a = answers[Math.min(reads++, answers.length - 1)];
    return {
      value: {
        exitCode: 0,
        stdout: `${JSON.stringify({ models: [], limits: {}, ...a })}\n`,
        stderr: "",
      },
    };
  });
  const measure = () => $.session.measure({ context: { percent: 1, tokens: 1 }, rateLimits: [], changed: [] } as never);
  const settle = () => new Promise((r) => setTimeout(r, 60));
  const gpt = async () =>
    String(((await $.command.run({ command: "gpt", args: "" } as never)) as { text?: string }).text);

  await measure(); // first read: missing
  await settle();
  expect(reads).toBe(1);
  now += 10_000;
  await measure();
  await settle();
  expect(reads).toBe(1); // too soon to look again
  now += 25_000;
  await measure();
  await settle();
  expect(reads).toBe(2);
  expect(await gpt()).toContain("ChatGPT"); // /gpt reads fresh: the third answer, ready
  expect(toasts.filter((t) => t.includes("Codex is ready")).length).toBe(1);
  now += 60_000;
  const before = reads;
  await measure();
  await settle();
  expect(reads).toBe(before); // ready: fresh for 10 minutes
});
