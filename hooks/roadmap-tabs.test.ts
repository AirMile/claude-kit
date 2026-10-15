import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
function world(on: On) {
  const sent: string[] = [];
  on("session.messages", async () => ({
    value: [
      { role: "user", text: "<system-reminder>skip me</system-reminder>", toolUses: [] },
      { role: "user", text: "Why does the import fail?", toolUses: [] },
      { role: "assistant", text: "The CSV has a BOM;\nstrip it first.", toolUses: [] },
    ],
  }));
  on("clock.after", async () => ({ value: undefined }));
  on("ui.toast", async () => ({ value: undefined }));
  on("prompt.submit", async (_$, e) => {
    sent.push(e.text);
    return { text: e.text };
  });
  on("session.root", async () => ({ value: "/p/app" }));
  on("session.model", async () => ({ value: "claude-opus-5-5" }));
  on("session.turns", async () => ({ value: 7 }));
  on("session.id", async () => ({ value: "s1" }));
  on("fs.exists", async () => ({ value: true }));
  on("fs.read", async () => {
    throw new Error("ENOENT");
  });
  on("command.list", async () => ({ value: [] }));
  on("store.get", async () => ({ value: undefined }));
  on("clock.now", async () => ({ value: 3_600_000 }));
  on("session.usage", async () => ({
    value: {
      startedAt: 0,
      context: {
        window: 200_000,
        tokens: 50_000,
        breakdown: {
          categories: [
            { name: "System prompt", tokens: 10_000, color: "x", isDeferred: false },
            { name: "Messages", tokens: 40_000, color: "y", isDeferred: false },
            { name: "Free space", tokens: 150_000, color: "z", isDeferred: false },
          ],
          totalTokens: 50_000,
          maxTokens: 200_000,
        },
      },
      rateLimits: [],
      cost: { usd: 1.5 },
    },
  }));
  on("process.run", async (_$, e) => {
    const args = e.argv.slice(1).join(" ");
    const stdout = args.startsWith("status")
      ? " M hooks/a.ts\n?? hooks/b.ts"
      : args.startsWith("rev-list")
        ? "1"
        : args.startsWith("log")
          ? "abc1234 feat: one"
          : "main";
    return { value: { exitCode: 0, stdout, stderr: "" } };
  });
  return sent;
}

function pane($: Parameters<Parameters<typeof test>[1]>[0]) {
  return $.ui.mount({
    plugin: "kit",
    surface: "terminal",
    component: "Pane",
    requestId: "kit-roadmap",
    props: {} as never,
  });
}

test("the Chat tab shows the run, the context by category and the cost", async ($, on) => {
  world(on);
  const ui = await pane($);
  await ui.press({ key: "tab-chat" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text).join("\n");
  expect(texts).toContain("opus-5-5");
  expect(texts).toContain("7 turns · 1h 0m · $1.50");
  expect(texts).toContain("Messages");
  expect(texts).not.toContain("Free space");
  expect(await ui.find({ key: "brainstorm" })).toBeTruthy(); // the pad, under every tab
});

test("the Changes tab lists changed files and commits not live", async ($, on) => {
  world(on);
  const ui = await pane($);
  await ui.press({ key: "tab-changes" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text).join("\n");
  expect(texts).toContain("M hooks/a.ts");
  expect(texts).toContain("?? hooks/b.ts");
  expect(texts).toContain("abc1234 feat: one");
  expect(await ui.find({ key: "changes-commit" })).toBeTruthy();
});

test("the Memory tab lists this chat newest first and Remember asks kit:lessons", async ($, on) => {
  const sent = world(on);
  const ui = await pane($);
  await ui.press({ key: "tab-memory" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text).join("\n");
  expect(texts).toContain("The CSV has a BOM; strip it first.");
  expect(texts).not.toContain("skip me");
  await ui.press({ key: "remember-0" });
  await new Promise((r) => setTimeout(r, 20));
  expect(sent.length).toBe(1);
  expect(sent[0]).toContain("kit:lessons");
  expect(sent[0]).toContain("The CSV has a BOM; strip it first.");
});
