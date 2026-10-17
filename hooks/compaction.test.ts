import type {
  On,
  SessionCompactInput,
  SessionCompactResult,
  SessionMessage,
} from "claude-code";
import { expect, test } from "claude-code/testing";

const SPEC =
  "Status: building\n\n## Acceptance criteria\n- [x] One\n- [ ] Two\n";
const HISTORY: SessionMessage[] = [
  {
    role: "user",
    text: "Fix login without changing billing",
    toolUses: [],
    handle: "u1",
  },
  {
    role: "assistant",
    text: "The retry failed; try a refresh",
    handle: "a1",
    toolUses: [
      {
        tool_use_id: "t1",
        tool: "Bash",
        input: { command: "npm test" },
        text: "FAIL",
        isError: true,
      },
    ],
  },
];
const NATIVE = {
  messages: [
    {
      role: "user" as const,
      text: "Native summary",
      toolUses: [],
      handle: "summary",
    },
  ],
  tokensBefore: 80000,
  tokensAfter: 12000,
  usage: {
    input_tokens: 20,
    output_tokens: 600,
    cache_read_input_tokens: 79000,
    cache_creation_input_tokens: 0,
  },
};

function world(
  on: On,
  opts: {
    branch?: string;
    spec?: string;
    skip?: boolean;
    unavailable?: boolean;
    logFails?: boolean;
  } = {},
) {
  const seen: SessionCompactInput[] = [];
  const reads: string[] = [];
  const logs: unknown[] = [];
  const modelCalls: unknown[] = [];
  on("model.complete", async (_$, e) => {
    modelCalls.push(e);
    throw new Error("compaction must use the native summarizer");
  });
  on("model.fork", async (_$, e) => {
    modelCalls.push(e);
    throw new Error("compaction must not fork a second summarizer");
  });
  on("session.root", async () => ({ value: "/p/app" }));
  on("process.run", async () => {
    if (opts.unavailable) throw new Error("git unavailable");
    return {
      value: {
        exitCode: 0,
        stdout: opts.branch ?? "main",
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  on("fs.read", async (_$, e) => {
    reads.push(e.path);
    if (!opts.spec || !e.path.endsWith(`/docs/specs/${opts.spec}.md`))
      throw new Error("missing");
    return { value: SPEC };
  });
  let clock = 1000;
  on("clock.now", async () => ({ value: (clock += 250) }));
  on("ui.log", async (_$, e) => {
    if (opts.logFails) throw new Error("logging unavailable");
    logs.push(e);
    return { value: undefined };
  });
  on("session.compact", async (_$, e) => {
    seen.push(e);
    return opts.skip ? { skip: "not enough messages" } : NATIVE;
  });
  return { seen, reads, logs, modelCalls };
}

function input(
  trigger: SessionCompactInput["trigger"] = "manual",
  messages: readonly SessionMessage[] = HISTORY,
) {
  return {
    trigger,
    messages,
    instructions: "Keep the exact migration command",
  };
}

function completed(result: SessionCompactResult) {
  if (!result.messages) throw new Error("expected a completed compaction");
  return result;
}

test("every main compaction trigger adds preservation priorities and keeps user instructions", async ($, on) => {
  const w = world(on);
  for (const trigger of ["manual", "auto", "plugin", "precompute"] as const) {
    await $.session.compact(input(trigger));
    const e = w.seen[w.seen.length - 1]!;
    expect(e.trigger).toBe(trigger);
    expect(e.instructions).toContain("Keep the exact migration command");
    for (const word of [
      "corrections",
      "decisions",
      "failed",
      "tests",
      "next",
      "Handoff",
    ])
      expect(e.instructions).toContain(word);
    expect(e.messages).toEqual(HISTORY);
  }
  expect(w.modelCalls).toEqual([]);
});

test("without a spec the native summary, handles and usage pass through unchanged", async ($, on) => {
  const w = world(on);
  const result = await $.session.compact(input());
  expect(result).toEqual(NATIVE);
  expect(w.seen[0]!.messages).toEqual(HISTORY);
});

test("feature branches retain the spec recovery note after the native summary", async ($, on) => {
  const w = world(on, { branch: "feat/login", spec: "login" });
  const result = completed(await $.session.compact(input()));
  expect(w.seen[0]!.instructions).toContain("docs/specs/login.md");
  expect(result.messages[0]).toEqual(NATIVE.messages[0]);
  expect(result.messages[1]!.text).toContain("Status: building");
  expect(result.messages[1]!.text).toContain("criteria 1/2");
  expect(result.messages[1]!.text).toContain("Handoff");
  expect(result.usage).toEqual(NATIVE.usage);
  expect(result.tokensBefore).toBe(80000);
  expect(result.tokensAfter).toBe(12000);
});

test("the latest explicit build overrides the branch, including expanded kit commands", async ($, on) => {
  const w = world(on, { branch: "fix/old", spec: "login" });
  for (const text of [
    "/kit:build login",
    "/build login",
    "<command-name>/kit:build</command-name>\n<command-args>login</command-args>",
  ]) {
    const messages = [
      ...HISTORY,
      { role: "user" as const, text, toolUses: [] },
    ];
    const result = completed(
      await $.session.compact(input("manual", messages)),
    );
    expect(result.messages[1]!.text).toContain("docs/specs/login.md");
  }
  expect(w.reads.every((p) => p === "/p/app/docs/specs/login.md")).toBe(true);
});

test("a build in assistant text or unsafe slug does not select a spec", async ($, on) => {
  world(on, { spec: "login" });
  for (const message of [
    { role: "assistant" as const, text: "/build login", toolUses: [] },
    { role: "user" as const, text: "/build ../login", toolUses: [] },
    { role: "user" as const, text: "For example, /build login", toolUses: [] },
  ]) {
    expect(
      await $.session.compact(input("manual", [...HISTORY, message])),
    ).toEqual(NATIVE);
  }
});

test("a spec selected on main survives a second compaction after the command is summarized", async ($, on) => {
  world(on, { spec: "login" });
  const first = completed(
    await $.session.compact(
      input("manual", [
        ...HISTORY,
        { role: "user", text: "/build login", toolUses: [] },
      ]),
    ),
  );
  const second = completed(
    await $.session.compact(input("auto", first.messages)),
  );
  expect(second.messages[1]!.text).toContain("docs/specs/login.md");
});

test("the newest build wins and a missing spec never revives an older feature", async ($, on) => {
  const w = world(on, { branch: "feat/login", spec: "login" });
  for (const text of ["/build missing", "/build", "/build ../login"]) {
    const result = await $.session.compact(
      input("manual", [
        { role: "user", text: "/build login", toolUses: [] },
        { role: "user", text, toolUses: [] },
      ]),
    );
    expect(result).toEqual(NATIVE);
  }
  expect(w.reads).toEqual(["/p/app/docs/specs/missing.md"]);
});

test("precompute receives the same instructions but installs no recovery note or diagnostic", async ($, on) => {
  const w = world(on, { branch: "fix/login", spec: "login" });
  const result = await $.session.compact(input("precompute"));
  expect(result).toEqual(NATIVE);
  expect(w.seen[0]!.instructions).toContain("docs/specs/login.md");
  expect(w.logs).toEqual([]);
});

test("subagent compaction passes through without instructions, spec reads or diagnostics", async ($, on) => {
  const w = world(on, { branch: "feat/login", spec: "login" });
  const e = { ...input(), agentId: "child" };
  expect(await $.session.compact(e)).toEqual(NATIVE);
  expect(w.seen).toEqual([e]);
  expect(w.reads).toEqual([]);
  expect(w.logs).toEqual([]);
});

test("a native skip passes through without a recovery note or diagnostic", async ($, on) => {
  const w = world(on, { skip: true, branch: "feat/login", spec: "login" });
  expect(await $.session.compact(input())).toEqual({
    skip: "not enough messages",
  });
  expect(w.logs).toEqual([]);
});

test("missing specs and unavailable git do not block native compaction", async ($, on) => {
  const w = world(on, { unavailable: true });
  expect(await $.session.compact(input())).toEqual(NATIVE);
  expect(w.seen.length).toBe(1);
  expect(w.seen[0]!.instructions).toContain("corrections");
});

test("completed compactions log the native counts and usage", async ($, on) => {
  const w = world(on);
  await $.session.compact(input());
  const logs = JSON.stringify(w.logs);
  for (const value of ["80000", "12000", "600", "79000", "250"])
    expect(logs).toContain(value);
});

test("a diagnostic failure cannot discard a completed native compaction", async ($, on) => {
  world(on, { logFails: true });
  expect(await $.session.compact(input())).toEqual(NATIVE);
});
