import type { EngineInterface, On, SessionMessage } from "claude-code";

import { noteCompact } from "./chat-facts";
import { flowRecovery } from "./flow";
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
// undefined: no build command; null: the latest build has no explicit valid slug.
function requestedSpec(
  messages: readonly SessionMessage[],
): string | null | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    // The command may be gone after the first compaction on an unrelated branch.
    const recovery = /^kit: building ([a-z0-9][a-z0-9-]*) · Status:/.exec(
      message.text,
    );
    if (recovery) return recovery[1];
    const plain = /^\s*\/(?:kit:)?build(?:\s+([\s\S]*))?$/.exec(message.text);
    const expanded = /<command-name>\/?(?:kit:)?build<\/command-name>/.test(
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
    return state ? { slug, ...state } : null;
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

    noteCompact();
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

    const notes: SessionMessage[] = [];
    const now = spec ? await activeSpec($, e.messages) : null;
    if (now)
      notes.push({
        role: "user",
        toolUses: [],
        text:
          `kit: building ${now.slug} · Status: ${now.status} · criteria ${now.done}/${now.total}. ` +
          `Re-read docs/specs/${now.slug}.md (## Handoff first) before continuing; ` +
          `if the /build procedure is no longer in context, run /build ${now.slug}.`,
      });
    // Flow's open task, which the summary may have lost (flow.ts).
    const open = flowRecovery();
    if (open) notes.push({ role: "user", toolUses: [], text: open });
    return notes.length
      ? { ...compacted, messages: [...compacted.messages, ...notes] }
      : compacted;
  });
}
