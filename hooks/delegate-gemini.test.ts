import { expect, test } from "claude-code/testing";

import { geminiRoute, parseAgyModels } from "./delegate-policy";
import { newTask, type Task } from "./flow-policy";
import { world, delegate } from "./delegate-fixture";

const IDS = [
  "gemini-3.8-flash-high",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-low",
  "gemini-4-flash-high",
  "claude-sonnet-4-6",
  "gpt-oss-120b-medium",
];

const ok = (response: string, id = "c-1") =>
  JSON.stringify({ conversation_id: id, status: "SUCCESS", response });

test("geminiRoute takes the newest Gemini at the role's effort and never another provider's model", () => {
  expect(geminiRoute("research", IDS)).toMatchObject({
    provider: "gemini",
    model: "gemini-4-flash-high",
    effort: "high",
    writes: false,
  });
  expect(geminiRoute("search", IDS)).toMatchObject({ effort: "low" });
  expect(geminiRoute("build", IDS)).toMatchObject({
    effort: "medium",
    writes: true,
  });
  expect(geminiRoute("review", IDS, "pro")).toMatchObject({
    provider: "none",
  });
  expect(geminiRoute("review", ["claude-sonnet-4-6"])).toMatchObject({
    provider: "none",
  });
});

test("parseAgyModels skips the banner and every non-Gemini model", () => {
  expect(
    parseAgyModels(
      "Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-opus-4-6-thinking\tClaude\n",
    ),
  ).toEqual(["gemini-3.8-flash-high"]);
});

test("provider gemini runs read-only in plan mode and returns only the response", async ($, on) => {
  const w = world(on, { agy: { json: ok("Conclusion: fine.") } });
  const out = await delegate($, {
    role: "research",
    brief: "Weigh this.",
    provider: "gemini",
  });
  const argv = w.spawned[0]?.argv ?? [];
  expect(argv[0]).toBe("/bin/agy");
  expect(argv).toContain("plan");
  expect(argv).toContain("gemini-3.8-flash-high");
  expect(argv).toContain("json");
  expect(argv.at(-1)).toContain("--print=Weigh this.");
  expect(out).toContain("Gemini 3.8 Flash (research, plan, read-only, effort high)");
  expect(out).toContain("Conclusion: fine.");
  expect(out).toContain('thread c-1');
  expect(w.spawned.some((s) => s.argv[0] === "/bin/codex")).toBe(false);
});

test("a family flash or pro implies Gemini; a GPT family stays on GPT", async ($, on) => {
  const w = world(on, { agy: { json: ok("done") } });
  await delegate($, { role: "plan", brief: "Plan.", family: "flash" });
  expect(w.spawned[0]?.argv[0]).toBe("/bin/agy");
  const bad = await delegate($, {
    role: "plan",
    brief: "Plan.",
    provider: "gemini",
    family: "sol",
  });
  expect(bad).toContain("Not run");
});

test("a build writes in accept-edits mode and its changes count as Gemini's", async ($, on) => {
  const w = world(on, { agy: { json: ok("Added it.") } });
  const out = await delegate($, {
    role: "build",
    brief: "Add a button.",
    provider: "gemini",
  });
  expect(w.spawned[0]?.argv).toContain("accept-edits");
  expect(out).toContain("Changed: src/a.ts");
  const t = Object.values(w.store.flowTasks as Record<string, Task>)[0];
  expect(t?.geminiWrote).toBe(true);
  expect(t?.gptWrote).toBe(undefined);
  expect(t?.claudeWrote).toBe(undefined);
});

test("an empty answer or a failed status says why and switches nothing", async ($, on) => {
  const w = world(on, {
    agy: { json: JSON.stringify({ conversation_id: "c", status: "ERROR", response: "" }), code: 1 },
  });
  const out = await delegate($, {
    role: "research",
    brief: "Weigh this.",
    provider: "gemini",
  });
  expect(out).toContain("failed");
  expect(out).toContain("Nothing was switched silently");
  expect(w.spawned).toHaveLength(1);
});

test("a thread of another provider cannot continue on Gemini, and a long brief is refused", async ($, on) => {
  const w = world(on, { agy: { json: ok("x") } });
  expect(
    await delegate($, {
      role: "research",
      brief: "More.",
      provider: "gemini",
      thread: "t-gpt",
    }),
  ).toContain("not a Gemini run");
  expect(
    await delegate($, {
      role: "research",
      brief: "x".repeat(200_001),
      provider: "gemini",
    }),
  ).toContain("at most 200000");
  expect(w.spawned).toHaveLength(0);
});

test("a Gemini review is recorded as another family's evidence for Claude's code", async ($, on) => {
  on("session.id", async () => ({ value: "s1" }));
  on("ui.log", async () => ({ value: undefined }));
  const t: Task = {
    ...newTask(1, "light"),
    gateV: 2,
    levels: { d: 1, e: 0, v: 2, r: 0 },
    lastEditAt: 1,
    lastCheckAt: 2,
    files: ["src/a.ts"],
    claudeWrote: true,
  };
  const w = world(on, {
    store: { flowTasks: { s1: t } },
    agy: { json: ok("verdict: pass\nNo findings.") },
  });
  await delegate($, { role: "review", brief: "Review", provider: "gemini" });
  const review = (w.store.flowTasks as { s1: Task }).s1.review;
  expect(review?.family).toBe("gemini");
  expect(review?.outcome).toBe("pass");
});

test("Gemini cannot review Gemini's own code", async ($, on) => {
  world(on, { agy: { json: ok("x") } });
  expect(
    await delegate($, {
      role: "review",
      brief: "Review",
      provider: "gemini",
      author: "gemini",
    }),
  ).toContain("another family");
});

test("a Gemini review carries the diff in the brief and is told it cannot run commands", async ($, on) => {
  on("session.id", async () => ({ value: "s1" }));
  on("ui.log", async () => ({ value: undefined }));
  const w = world(on, { agy: { json: ok("verdict: pass") } });
  await delegate($, { role: "review", brief: "Review", provider: "gemini" });
  const prompt = w.spawned[0]?.argv.at(-1) ?? "";
  expect(prompt).toContain("Uncommitted diff");
  expect(prompt).toContain("cannot run shell commands");
  expect(prompt).not.toContain("git status, git diff");
});

test("provider and family must agree, and a Gemini thread cannot continue on GPT", async ($, on) => {
  const w = world(on, { agy: { json: ok("x", "c-9") } });
  expect(
    await delegate($, {
      role: "plan",
      brief: "Plan.",
      provider: "gpt",
      family: "flash",
    }),
  ).toContain("contradicts");
  await delegate($, { role: "research", brief: "A", provider: "gemini" });
  expect(
    await delegate($, { role: "research", brief: "B", thread: "c-9" }),
  ).toContain("continue it with provider gemini");
  expect(w.spawned.filter((s) => s.argv[0] === "/bin/codex")).toHaveLength(0);
});

test("brief plus diff over the limit is refused after the diff is attached", async ($, on) => {
  on("session.id", async () => ({ value: "s1" }));
  on("ui.log", async () => ({ value: undefined }));
  const w = world(on, { agy: { json: ok("verdict: pass") } });
  const out = await delegate($, {
    role: "research",
    brief: "x".repeat(199_990),
    provider: "gemini",
  });
  expect(out).toContain("at most 200000");
  expect(w.spawned).toHaveLength(0);
});

const denied = (action: string, id = "c-d") =>
  JSON.stringify({
    conversation_id: id,
    status: "SUCCESS",
    response: "",
    denied_actions: [{ action, display_name: action }],
  });

test("a denied tool call is retried once in the same conversation and the answer is returned", async ($, on) => {
  const w = world(on, { agyJsons: [denied("command"), ok("Answer after retry.", "c-d")] });
  const out = await delegate($, { role: "research", brief: "Weigh this.", provider: "gemini" });
  expect(w.spawned).toHaveLength(2);
  const second = w.spawned[1]?.argv ?? [];
  expect(second).toContain("--conversation");
  expect(second).toContain("c-d");
  expect(second.at(-1)).toContain("Do not call that tool again");
  expect(out).toContain("Answer after retry.");
  expect(out).toContain("retried once after a denied command");
});

test("a second denial names the denied tool and what to do, without a third run", async ($, on) => {
  const w = world(on, { agyJsons: [denied("read_file"), denied("read_file")] });
  const out = await delegate($, { role: "research", brief: "Weigh this.", provider: "gemini" });
  expect(w.spawned).toHaveLength(2);
  expect(out).toContain("failed");
  expect(out).toContain("a file outside the workspace");
  expect(out).toContain("dirs");
});

test("a denial without a conversation id is not retried", async ($, on) => {
  const w = world(on, {
    agy: { json: JSON.stringify({ status: "SUCCESS", response: "", denied_actions: [{ action: "command" }] }) },
  });
  const out = await delegate($, { role: "research", brief: "Weigh this.", provider: "gemini" });
  expect(w.spawned).toHaveLength(1);
  expect(out).toContain("a shell command");
});

test("dirs become extra --add-dir folders for Gemini only, and must be absolute", async ($, on) => {
  const w = world(on, { agy: { json: ok("done") } });
  await delegate($, {
    role: "research",
    brief: "Read the note.",
    provider: "gemini",
    dirs: ["/notes/vault/x"],
  });
  const argv = w.spawned[0]?.argv ?? [];
  const at = argv.indexOf("/notes/vault/x");
  expect(argv[at - 1]).toBe("--add-dir");
  expect(argv.filter((a) => a === "--add-dir")).toHaveLength(2);
  expect(argv.at(-1)).toContain("under /p/app, /notes/vault/x");
  expect(
    await delegate($, { role: "research", brief: "x", provider: "gemini", dirs: ["relative/dir"] }),
  ).toContain("absolute");
  expect(
    await delegate($, { role: "research", brief: "x", provider: "gpt", dirs: ["/notes/vault/x"] }),
  ).toContain("dirs is for Gemini");
});

test("every Gemini brief states the readable roots and the answer length", async ($, on) => {
  const w = world(on, { agy: { json: ok("done") } });
  await delegate($, { role: "research", brief: "Weigh this.", provider: "gemini" });
  const prompt = w.spawned[0]?.argv.at(-1) ?? "";
  expect(prompt).toContain("only under /p/app");
  expect(prompt).toContain("under about 5000 characters");
});

test("a Gemini answer is cut only past 16000 characters", async ($, on) => {
  world(on, { agyJsons: [ok("a".repeat(7000)), ok("b".repeat(17000))] });
  const mid = await delegate($, { role: "research", brief: "A", provider: "gemini" });
  expect(mid).not.toContain("incomplete");
  const long = await delegate($, { role: "research", brief: "B", provider: "gemini" });
  expect(long).toContain("incomplete: cut at 16000");
});

test("dirs always ask the user, even for a read-only role, and broad folders are refused", async ($, on) => {
  const w = world(on, { agy: { json: ok("done") } });
  const checked = await $.tool.check({
    tool: "mcp__kit__delegate",
    input: { role: "research", brief: "Read.", provider: "gemini", dirs: ["/notes/vault/x"] },
  } as never);
  expect(checked.decision).toBe("ask");
  const plain = await $.tool.check({
    tool: "mcp__kit__delegate",
    input: { role: "research", brief: "Read.", provider: "gemini" },
  } as never);
  expect(plain.decision).toBe("allow");
  for (const bad of ["/", "/Users/me", "/a/b/../c", "C:\\", "C:\\Users\\me", "\\\\srv\\share", "x/y/z", "/Users/me/.", "/./././", "C:\\.\\.\\."])
    expect(
      await delegate($, { role: "research", brief: "x", provider: "gemini", dirs: [bad] }),
    ).toContain("Not run");
  for (const good of ["/Users/me/Documents/Vault", "C:\\Users\\me\\Docs\\Vault", "\\\\srv\\share\\notes"])
    expect(
      await delegate($, { role: "research", brief: "x", provider: "gemini", dirs: [good] }),
    ).not.toContain("Not run");
  expect(w.spawned.length).toBe(3);
});

test("the retry names the approved folders it may read", async ($, on) => {
  const w = world(on, { agyJsons: [denied("command"), ok("ok", "c-d")] });
  await delegate($, { role: "research", brief: "x", provider: "gemini", dirs: ["/notes/vault/x"] });
  expect(w.spawned[1]?.argv.at(-1)).toContain("no files outside /p/app, /notes/vault/x");
});
