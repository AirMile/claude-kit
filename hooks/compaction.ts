import type { EngineInterface, On, SessionMessage } from "claude-code";

import {
  compactionStarted,
  recordCompaction,
  type Restored,
} from "./auto-compact";
import { flowReadiness, flowRecovery } from "./flow";
import {
  isFlowNote,
  isKitNote,
  isSpecNote,
  SPEC_NOTE,
} from "./kit-notes";
import { isPinsNote, pinsNote } from "./pins";
import { isReadinessNote, readinessNote } from "./readiness";
import { isRecentNote, recentNote } from "./recent";
import { isReplyNote, replyNote } from "./reply";
import { branchSlug, inRoot, parseSpec } from "./spec";

// Add priorities to the native summarizer, never rebuild its input or its summary.
// The same priorities reach precompute, whose summary core may reuse later.
const PRESERVE = [
  "Preserve continuity of the current task: the latest user request and corrections, " +
    "scope, constraints and current workflow phase.",
  "Keep decisions and their reasons, failed attempts and why they failed, exact errors, " +
    "tests run and their outcomes, checks not yet run, blockers and the concrete next step.",
  "Keep developments since the last spec Handoff, especially user corrections and pending work. " +
    "Do not turn assumptions, proposed actions or unrun tests into completed facts.",
  "Prefer exact file paths, symbols and commands over copied file contents that can be re-read. " +
    "Explicit user compaction instructions below take priority over these preservation defaults.",
].join("\n");

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

// An actual user command or our recovery note selects a spec, never tool output or a command
// quoted in another of kit's notes.
// undefined: no task-readiness command; null: the latest command has no explicit valid slug.
function requestedSpec(
  messages: readonly SessionMessage[],
): string | null | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    if (message.toolResults?.length) continue;
    // The command may be gone after the first compaction on an unrelated branch.
    const recovery = SPEC_NOTE.exec(message.text);
    if (recovery) return recovery[1];
    if (isKitNote(message)) continue;
    const plain = /^\s*\/(?:kit:)?task-readiness(?:\s+([\s\S]*))?$/.exec(
      message.text,
    );
    const expanded =
      /<command-name>\/?(?:kit:)?task-readiness<\/command-name>/.test(
        message.text,
      );
    if (!plain && !expanded) continue;
    const arg = plain
      ? plain[1]?.trim()
      : /<command-args>([^<]*)<\/command-args>/.exec(message.text)?.[1]?.trim();
    return arg && SLUG.test(arg) ? arg : null;
  }
  return undefined;
}

// null: no spec to resume; undefined (with `unknown`): it could not be read.
async function activeSpec(
  $: EngineInterface,
  messages: readonly SessionMessage[],
  unknown?: true,
) {
  try {
    const root = await $.session.root();
    let slug = requestedSpec(messages);
    if (slug === undefined) {
      const git = await $.process
        .run(["git", "symbolic-ref", "--short", "HEAD"], { cwd: root })
        .catch(() => null);
      // git could not run: not the same as no branch, unless the project has no specs at all
      if (!git && unknown)
        return (await $.fs.exists(inRoot(root, "docs/specs"))) ? undefined : null;
      slug = git?.exitCode === 0 ? branchSlug(git.stdout) : null;
    }
    if (!slug || !SLUG.test(slug)) return null;
    const file = inRoot(root, `docs/specs/${slug}.md`);
    const text = await $.fs.read(file).catch(async (err: unknown) => {
      // No such file is no spec; a file that is there but can't be read is unknown.
      if (unknown && !(await $.fs.exists(file))) return null;
      throw err;
    });
    if (text === null) return null;
    const state = parseSpec(text);
    // A finished spec has nothing to resume, and its note would reselect it every time.
    return state && state.status !== "done" ? { slug, ...state } : null;
  } catch {
    // missing files or unavailable git must never block native compaction
    return unknown ? undefined : null;
  }
}

export function compaction(on: On) {
  on("session.compact", async ($, e, next) => {
    if (e.agentId) return next(e);
    if (e.trigger !== "precompute") compactionStarted(); // a planned idle compact is stale
    const spec = await activeSpec($, e.messages, true);
    const instructions = [
      PRESERVE,
      spec
        ? `Active spec: docs/specs/${spec.slug}.md. Keep its path and the current build phase.`
        : undefined,
      e.instructions,
    ]
      .filter(Boolean)
      .join("\n\n");
    const started = await $.clock.now().catch(() => undefined);
    const compacted = await next({ ...e, instructions });
    if (e.trigger === "precompute" || !compacted.messages) return compacted;

    // Native counts are accounting, not proof of quality or dollar savings. Missing usage
    // can mean core reused a precomputed summary; leave it absent rather than inventing it.
    try {
      const ended = await $.clock.now();
      $.ui.log(
        `kit compact: ${JSON.stringify({
          trigger: e.trigger,
          tokensBefore: compacted.tokensBefore,
          tokensAfter: compacted.tokensAfter,
          durationMs:
            started === undefined ? undefined : Math.max(0, ended - started),
          usage: compacted.usage,
        })}`,
        { to: "debug" },
      );
    } catch {
      // Diagnostic failures cannot discard a completed native summary.
    }

    const out = await withNotes($, e.messages, compacted.messages, spec);
    // After the notes, so the ledger says what came back (auto-compact.ts).
    await recordCompaction($, {
      trigger: e.trigger,
      before: compacted.tokensBefore,
      after: compacted.tokensAfter,
      notes: out.restored,
    }).catch(() => {}); // the ledger can never discard a completed summary
    try {
      $.ui.toast(compactToast(compacted.tokensBefore, compacted.tokensAfter, out.restored));
    } catch {
      // A missing toast must not discard a completed compaction.
    }
    return out.messages === compacted.messages
      ? compacted
      : { ...compacted, messages: out.messages };
  });
}

const k = (n?: number) => (n === undefined ? "?" : `${Math.round(n / 1000)}k`);

export function compactToast(
  before: number | undefined,
  after: number | undefined,
  r: Restored,
): string {
  const parts = [
    r.restored.length ? `restored ${r.restored.join(", ")}` : "nothing to restore",
    r.cut.length ? `shortened ${r.cut.join(", ")}` : "",
    r.failed.length
      ? `could not read ${r.failed.join(", ")} (an earlier copy stays where there was one)`
      : "",
  ].filter(Boolean);
  return `kit: compacted ${k(before)} → ${k(after)} · ${parts.join(" · ")}`;
}

type Note = { name: string; text: string; cut?: boolean };

// kit's notes after the summary. Each is built on its own: one that fails is named and leaves
// any copy an earlier compaction kept in place; one that is read replaces that copy (or removes
// it when there is nothing left to say), so notes never stack up.
async function withNotes(
  $: EngineInterface,
  before: readonly SessionMessage[],
  kept: readonly SessionMessage[],
  spec: Awaited<ReturnType<typeof activeSpec>>, // read before the summary
): Promise<{ messages: readonly SessionMessage[]; restored: Restored }> {
  const restored: Restored = { restored: [], cut: [], failed: [] };
  const drop: ((m: SessionMessage) => boolean)[] = [];
  const first: Note[] = []; // old requests go first, so what is still to do closes the context
  const last: Note[] = [];
  // Each step: undefined = could not be read (keep the old copy), null = nothing to say.
  // "keep" = nothing new to say: an earlier copy stays.
  const step = async (
    name: string,
    is: (m: SessionMessage) => boolean,
    into: Note[],
    build: () => Promise<Note | null | undefined | "keep">,
  ) => {
    let note: Note | null | undefined | "keep";
    try {
      note = await build();
    } catch {
      note = undefined;
    }
    if (note === "keep") return; // nothing new: an earlier copy stays, nothing failed
    if (note === undefined) {
      restored.failed.push(name);
      return;
    }
    drop.push(is);
    if (note) into.push(note);
  };

  await step("recent messages", isRecentNote, first, async () => {
    const text = await recentNote($, kept);
    if (text === false) return undefined; // unreadable
    if (text === undefined) return "keep"; // none noted
    return text ? { name: "recent messages", text } : null;
  });
  // The open task's readiness block, kept on the flow task (flow.ts, readiness.ts).
  await step("readiness", isReadinessNote, last, async () => {
    const r = await flowReadiness($, before);
    if (!r.known) return undefined;
    return r.id !== undefined && r.block
      ? { name: "readiness", text: readinessNote(r.id, r.block) }
      : null;
  });
  await step("spec", isSpecNote, last, async () => {
    // The read before the summary failed: a note core kept stays, and the toast names it.
    if (spec === undefined) return undefined;
    // None, or finished: a kept note would present it as still open.
    if (spec === null) return null;
    // Finished or gone since: a kept note would present it as still open.
    const read = await activeSpec($, before, true);
    if (read === null) return null;
    // A second read that fails falls back to the first: a kept note is never dropped unseen.
    const now = read ?? spec;
    return (
      now && {
        name: `spec ${now.slug}`,
        text:
          `kit: building ${now.slug} · Status: ${now.status} · criteria ${now.done}/${now.total}. ` +
          `Re-read docs/specs/${now.slug}.md (## Handoff first) before continuing; ` +
          `if the /task-readiness procedure is no longer in context, run /task-readiness ${now.slug}.`,
      }
    );
  });
  // Flow's open task, which the summary may have lost (flow.ts); read with the readiness step.
  await step("flow task", isFlowNote, last, async () => {
    const r = await flowReadiness($, before);
    if (!r.known) return undefined;
    const text = flowRecovery();
    return text ? { name: "flow task", text } : null;
  });
  // The user's pins (pins.ts), from disk: once read, a removed pin stays removed.
  await step("pins", isPinsNote, last, async () => {
    const text = await pinsNote($);
    return text === undefined ? undefined : text ? { name: "pins", text } : null;
  });
  // Last of all: the reply the user's next message answers (reply.ts).
  await step("last reply", isReplyNote, last, async () => {
    const r = replyNote(before, kept, isKitNote);
    return r && { name: "last reply", text: r.text, cut: r.cut };
  });

  const notes = [...first, ...last];
  for (const n of notes) {
    restored.restored.push(n.name);
    if (n.cut) restored.cut.push(n.name);
  }
  const left = kept.filter((m) => !drop.some((is) => is(m)));
  if (!notes.length && left.length === kept.length)
    return { messages: kept, restored };
  return {
    messages: [
      ...left,
      ...notes.map((n): SessionMessage => ({ role: "user", toolUses: [], text: n.text })),
    ],
    restored,
  };
}
