<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# native-compaction

Status: done
Design: —

## Goal

Help native Claude Code compaction preserve the information needed to continue work,
without pruning history or introducing a second model-generated summary. Keep the
existing Compact button and improve recovery from specs outside feature branches.

## Acceptance criteria

- [x] Happy: manual, automatic, plugin and precomputed main-session compactions pass
      preservation instructions to the native summarizer, alongside any user instructions.
- [x] Happy: the instructions prioritize the current task, user corrections, decisions and
      reasons, failed attempts, test evidence, pending work and changes since the Handoff.
- [x] Edge: input messages and native output messages retain their handles, tool data and
      metadata; only the existing spec recovery note may be appended after compaction.
- [x] Happy: an explicit /build <slug> (including expanded kit skill commands) selects its
      existing spec on any branch; without one, feat/ and fix/ branch discovery still works.
- [x] Error: missing specs or unavailable git do not block native compaction; skips and
      subagent compactions pass through, and precompute adds no recovery note or counter.
- [x] Happy: completed compactions log native before/after token counts, summarizer usage
      and duration when available, without extra model calls or estimated dollar savings.

## Out of scope

- Client-side pruning, custom summaries, automatic compaction thresholds or UI redesign.
- Skill edits, automatic Handoff writes, persistent telemetry or measured quality claims.

## Approach

- hooks/compaction.ts: native-compaction wrapper, instructions, explicit build discovery,
  branch fallback, existing recovery note and diagnostic logging; bounded failures.
- hooks/register.tsx: register the compaction wrapper, removing the inline implementation.
- hooks/compaction.test.ts: exercise the installed mod through the native testing harness.
- README.md: describe preservation instructions, spec discovery and diagnostics.
- Both plugin manifests: bump 0.15.24 to 0.15.25 and refresh local installations.

## Tests

- Native mod tests: all triggers, user instructions, unchanged handles/tool data/metadata,
  explicit and expanded commands, branch fallback, skips, subagents and unavailable files.
- Native plugin validation from a scratch copy, full mod suite, push/Codex hook checks,
  SEO helper checks and TypeScript check (identify existing test typing errors separately).
- No LLM benchmark: deterministic tests verify integration, not summary quality.

## Handoff

Independent verifier passed all six criteria on 2026-10-17; no manual items or later notes.
Native priorities, spec recovery and diagnostics are ready in version 0.15.25.
User requested local plugin updates; no skill changes or remote publication are needed.

## Verify

Independent verifier: 6/6 criteria pass; no manual items or improvement notes.
Native mod suite: 75 passed, 0 failed; push-guard: 20; Codex hooks: 10; SEO helper passed.
Scratch plugin validation passed without warnings; production TypeScript passed.
Full tsc: 35 pre-existing partial-fixture diagnostics in older tests, 0 new diagnostics.
Deterministic checks verify integration and passthrough, not LLM summary quality or savings.

## Fixes
