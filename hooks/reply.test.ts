import type { SessionMessage } from "claude-code";
import { expect, test } from "claude-code/testing";

import { isKitNote } from "./kit-notes";
import { isReplyNote, replyNote } from "./reply";

const user = (text: string): SessionMessage => ({
  role: "user",
  text,
  toolUses: [],
});
const said = (text: string, toolUses: SessionMessage["toolUses"] = []) =>
  ({ role: "assistant", text, toolUses }) as SessionMessage;
const result: SessionMessage = {
  role: "user",
  text: "",
  toolUses: [],
  toolResults: [{ tool_use_id: "t1", text: "ok", isError: false } as never],
};
const QUESTION = "Plan: A, then B.\n\nZal ik dit plan bouwen?";

test("a finished turn's reply comes back word for word, labelled as the one the user answers", () => {
  const r = replyNote(
    [user("plan it"), said(QUESTION)],
    [user("summary")],
    isKitNote,
  )!;
  expect(r.cut).toBe(false);
  expect(r.text).toContain("the user's next message answers it");
  expect(r.text.endsWith(`\n\n${QUESTION}`)).toBe(true);
  expect(isReplyNote(user(r.text))).toBe(true);
  expect(isKitNote(user(r.text))).toBe(true);
});

test("mid-turn: the newest text is labelled as written before later tool calls", () => {
  const r = replyNote(
    [
      user("go"),
      said("Starting with A."),
      said("", [{ tool_use_id: "t1", tool: "Bash", input: {} } as never]),
      result,
    ],
    [],
    isKitNote,
  )!;
  expect(r.text).toContain("still running");
  expect(r.text).toContain("Starting with A.");
});

test("the user's answer after it is noted; core keeping the reply means no note", () => {
  expect(
    replyNote([said(QUESTION), user("ja")], [], isKitNote)!.text,
  ).toContain("The user has written since");
  expect(replyNote([said(QUESTION)], [said(QUESTION)], isKitNote)).toBe(null);
  // With handles, only the same message counts: another one with the same text does not.
  const ask = { ...said("Welke?"), handle: "a2" };
  expect(
    replyNote([ask], [{ ...said("Welke?"), handle: "a1" }], isKitNote),
  ).not.toBe(null);
  expect(replyNote([ask], [ask], isKitNote)).toBe(null);
  expect(replyNote([user("hi")], [], isKitNote)).toBe(null);
});

test("AskUserQuestion's questions and options are part of the reply", () => {
  const ask = said("", [
    {
      tool_use_id: "q1",
      tool: "AskUserQuestion",
      input: {
        questions: [
          { question: "Welke aanpak?", options: [{ label: "A" }, { label: "B" }] },
        ],
      },
    } as never,
  ]);
  expect(replyNote([user("go"), ask], [], isKitNote)!.text).toContain(
    "Asked: Welke aanpak? (options: A / B)",
  );
});

test("a long reply keeps its start and end and says what is left out, never splitting a character", () => {
  const long = `${"a".repeat(2_999)}😀${"b".repeat(5_000)}end`;
  const r = replyNote([said(long)], [], isKitNote)!;
  expect(r.cut).toBe(true);
  expect(r.text).toMatch(/\[\.\.\. \d+ characters not repeated here \.\.\.\]/);
  expect(r.text.endsWith("end")).toBe(true);
  expect(r.text).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
});

test("a second compaction carries the earlier note over until a newer reply comes", () => {
  const first = replyNote([said(QUESTION)], [], isKitNote)!.text;
  const summary = user("summary");
  expect(replyNote([summary, user(first)], [summary], isKitNote)!.text).toBe(first);
  // Core kept the note itself: it goes again, last, once (compaction.ts drops the kept copy).
  expect(
    replyNote([summary, user(first)], [summary, user(first)], isKitNote)!.text,
  ).toBe(first);
  // The user answered since: the carried note says so, also once the answer is summarized away.
  const answered = replyNote(
    [summary, user(first), user("nee")],
    [summary],
    isKitNote,
  )!.text;
  expect(answered).toContain("The user has written since");
  expect(
    replyNote([summary, user(answered)], [summary], isKitNote)!.text,
  ).toContain("The user has written since");
  // The label sentence quoted inside the reply itself does not count as an answer.
  const quoting = replyNote(
    [said("It said: The user has written since; their messages come after it in time. OK?")],
    [],
    isKitNote,
  )!.text;
  expect(
    replyNote([summary, user(quoting)], [summary], isKitNote)!.text,
  ).toContain("the user's next message answers it");
  // A newer reply wins.
  expect(
    replyNote([summary, user(first), said("Gebouwd.")], [summary], isKitNote)!
      .text,
  ).toContain("Gebouwd.");
});

test("an answered question card is labelled answered and carries the answer", () => {
  const card = said("", [
    {
      tool_use_id: "q1",
      tool: "AskUserQuestion",
      input: { questions: [{ question: "Welke aanpak?", options: [{ label: "A" }] }] },
      text: "User answered: A",
    } as never,
  ]);
  const r = replyNote([user("go"), card, result], [], isKitNote)!;
  expect(r.text).toContain("The user has written since");
  expect(r.text).toContain("The user's answer: User answered: A");
});

test("a carried note keeps its label when nothing came since", () => {
  const running = replyNote(
    [user("go"), said("Starting with A."), result],
    [],
    isKitNote,
  )!.text;
  expect(running).toContain("still running");
  const summary = user("summary");
  expect(replyNote([summary, user(running)], [summary], isKitNote)!.text).toBe(running);
});

test("a refused question card is not an answer", () => {
  const card = said("", [
    {
      tool_use_id: "q1",
      tool: "AskUserQuestion",
      input: { questions: [{ question: "Welke aanpak?", options: [{ label: "A" }] }] },
      text: "The user declined to answer.",
      isError: true,
    } as never,
  ]);
  const r = replyNote([user("go"), card, result], [], isKitNote)!;
  expect(r.text).not.toContain("The user has written since");
  expect(r.text).not.toContain("The user's answer");
});
