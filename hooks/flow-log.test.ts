import { expect, test } from "claude-code/testing";

import { endEntry, keep, marked, notable, report } from "./flow-log";
import { newTask, onCheck, type Task } from "./flow-policy";

test("the log keeps 14 days, records each task's end, and takes the user's marks", async () => {
  const day = 86_400_000;
  const t: Task = {
    ...onCheck(
      {
        ...newTask(1, "light"),
        first: "light",
        track: "medium",
        files: ["src/a.ts"],
      },
      true,
      1,
      undefined,
    ),
  };
  let log = keep([], {
    at: 0,
    event: "start",
    text: "add a button",
    track: "light",
    task: 1,
  });
  log = keep(log, endEntry(t, "verified", 2 * day));
  log = keep(log, {
    at: 15 * day,
    event: "start",
    text: "build the importer",
    track: "heavy",
    task: 2,
  });
  expect(log.length).toBe(2); // the first is older than 14 days
  expect(notable(log)[1]?.event).toBe("end");
  const m = marked(log, 2, "too-light");
  expect(m?.[0]?.mark).toBe("too-light");
  const out = report(m ?? []);
  expect(out).toContain("grew after the first pick (too light?): 1");
  expect(out).toContain("too-light 1");
  expect(
    report([
      { at: 0, event: "decision", text: "", levels: "D2 E1 V1" },
      { at: 2, event: "read-note", text: "5 calls, 42 chars" },
      {
        at: 3,
        event: "delegate",
        text: "search",
        provider: "gpt",
        outcome: "ok",
      },
      {
        at: 4,
        event: "delegate",
        text: "research",
        provider: "claude",
        outcome: "ok",
      },
      {
        at: 5,
        event: "delegate",
        text: "build",
        provider: "none",
        outcome: "failed",
      },
      {
        at: 6,
        event: "delegate",
        text: "search",
        provider: "gpt",
        outcome: "failed",
      },
      {
        at: 7,
        event: "delegate",
        text: "build",
        provider: "none",
        outcome: "failed",
      },
    ]),
  ).toContain(
    "read notes 1 · delegated 2 (gpt 1, claude 1) · not delegated 2 · failed 1",
  );
  expect(out).toContain("decisions: none yet");
  expect(out).toContain(
    "end medium (from light) · 1 files · 1 checks · verified: src/a.ts [too-light]",
  );
});

test("/flow counts decisions per level and which E1+ ones saw a GPT run", async () => {
  const out = report([
    { at: 1, event: "decision", text: "", levels: "D1 E1 V1" },
    { at: 2, event: "delegate", text: "build", provider: "gpt", outcome: "ok" },
    { at: 3, event: "decision", text: "", levels: "D0 E0 V0" },
    {
      at: 4,
      event: "delegate",
      text: "research",
      provider: "claude",
      outcome: "ok",
    },
    { at: 5, event: "decision", text: "", levels: "D3 E2 V3" },
    { at: 6, event: "levels", text: "a failing check", levels: "D3 E3 V3" },
    { at: 7, event: "decision", text: "", levels: "D1 E1 V2" },
  ]);
  expect(out).toContain(
    "decisions 4: D0 1 D1 2 D2 0 D3 1 · E0 1 E1 2 E2 1 E3 0 · V0 1 V1 1 V2 1 V3 1 · raised 1",
  );
  // Only the first E1+ decision was followed by a GPT run; a Claude run does not count.
  expect(out).toContain("E1+ decisions with a GPT run: 1 of 3");
});


test("report counts waived and historical endings", async () => {
  const out = report([
    { at: 1, event: "end", text: "", outcome: "verified" },
    { at: 2, event: "end", text: "", outcome: "waived" },
    { at: 3, event: "end", text: "", outcome: "unverified" },
    { at: 4, event: "end", text: "", outcome: "unresolved" },
  ]);
  expect(out).toContain("ended verified 1 · waived 1 · unresolved 1 · unverified 1");
});
