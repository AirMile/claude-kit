import type { EngineInterface, On, SessionMessage } from "claude-code";

import { recordCompaction } from "./auto-compact";
import { flowRecovery } from "./flow";
import { isPinsNote, pinsNote } from "./pins";
import { isRecentNote, recentNote } from "./recent";
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

// An actual user command or our recovery note selects a spec, never tool output.
// undefined: no task-readiness command; null: the latest command has no explicit valid slug.
function requestedSpec(
  messages: readonly SessionMessage[],
): string | null | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    // Our notes of quoted text are not commands.
    if (isPinsNote(message) || isRecentNote(message)) continue;
    // The command may be gone after the first compaction on an unrelated branch.
    const recovery = /^kit: building ([a-z0-9][a-z0-9-]*) · Status:/.exec(
      message.text,
    );
    if (recovery) return recovery[1];
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

async function activeSpec(
  $: EngineInterface,
  messages: readonly SessionMessage[],
) {
  try {
    const root = await $.session.root();
    let slug = requestedSpec(messages);
    if (slug === undefined) {
      const git = await $.process
        .run(["git", "symbolic-ref", "--short", "HEAD"], { cwd: root })
        .catch(() => null);
      slug = git?.exitCode === 0 ? branchSlug(git.stdout) : null;
    }
    if (!slug || !SLUG.test(slug)) return null;
    const state = parseSpec(
      await $.fs.read(inRoot(root, `docs/specs/${slug}.md`)),
    );
    // A finished spec has nothing to resume, and its note would reselect it every time.
    return state && state.status !== "done" ? { slug, ...state } : null;
  } catch {
    return null; // missing files or unavailable git must never block native compaction
  }
}

export function compaction(on: On) {
  on("session.compact", async ($, e, next) => {
    if (e.agentId) return next(e);
    const spec = await activeSpec($, e.messages);
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
    // After the log, so its duration is the summary's alone (auto-compact.ts's ledger).
    await recordCompaction($, {
      trigger: e.trigger,
      before: compacted.tokensBefore,
      after: compacted.tokensAfter,
    }).catch(() => {}); // the ledger can never discard a completed summary

    const notes: SessionMessage[] = [];
    const now = spec ? await activeSpec($, e.messages) : null;
    if (now)
      notes.push({
        role: "user",
        toolUses: [],
        text:
          `kit: building ${now.slug} · Status: ${now.status} · criteria ${now.done}/${now.total}. ` +
          `Re-read docs/specs/${now.slug}.md (## Handoff first) before continuing; ` +
          `if the /task-readiness procedure is no longer in context, run /task-readiness ${now.slug}.`,
      });
    // Flow's open task, which the summary may have lost (flow.ts).
    const open = flowRecovery();
    if (open) notes.push({ role: "user", toolUses: [], text: open });
    // The user's pins (pins.ts) and latest messages (recent.ts), from disk. Once read, they
    // replace any note core kept, so a removed pin stays removed.
    const pinned = await pinsNote($);
    const latest = await recentNote($, compacted.messages);
    const kept = compacted.messages.filter(
      (m) =>
        !(pinned !== undefined && isPinsNote(m)) &&
        !(latest !== undefined && isRecentNote(m)),
    );
    // Old requests go first, so what is still to do closes the context.
    if (latest) notes.unshift({ role: "user", toolUses: [], text: latest });
    if (pinned) notes.push({ role: "user", toolUses: [], text: pinned });
    return notes.length || kept.length !== compacted.messages.length
      ? { ...compacted, messages: [...kept, ...notes] }
      : compacted;
  });
}
