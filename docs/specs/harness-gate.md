<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# harness-gate

Status: done
Design: —

## Goal

Make the flow's Stop gate ask the right question (phase 2a of the rebuild; 1 = task-readiness-core).
Today one green check on the latest code closes a task, even when a kind the project has (tests)
never ran, and a suite that was already red before the task can never close. A pass is evidence
only for the kind it measures, on the code it ran on.

## Acceptance criteria

- [x] Required kinds: a medium or heavy task that changed code is not checked until every kind
      `AGENTS.md § Commands` lists (Test → test, Lint / typecheck → static, Build → build) passed on
      the latest code; a lint-only pass does not close it. Light tasks keep one passing check.
      Check: `claude plugin test .` with new cases in hooks/flow-required.test.ts.
- [x] No Commands section, or a kind marked `—`/none: nothing is required for it (today's behavior).
- [x] Evidence per kind and print: a required kind that passed on older code is not evidence after
      a later edit, also when it never failed (closes Later `evidence-stale-kind`).
- [x] Baseline: a check that fails while the task has no code edits yet marks that kind
      baseline-red with a hash of its failing lines. A later failure with the same hash does not open
      the kind and does not block; a different hash opens it as now. The hold text names the
      baseline-red kinds as pre-existing.
- [x] Compound commands: `npm run lint && npm test` failing opens both kinds, passing counts both
      (tests pin it; the Later `check-compound-kinds` note was stale).
- [x] Resume: a prompt `/task-readiness <slug>` or `/kit:task-readiness <slug>` is heavy again.
- [x] Existing gate tests (stale evidence, failed tests + green lint, heavy without spec) pass
      unchanged.
- [x] `claude plugin test .`, `claude plugin validate .`, push-guard, codex-hooks, shellcheck pass.

## Out of scope

- Security/Quality kinds, checker-file guard, commit gate (2b, 2c). Haiku criteria storage (later).

## Approach

- New pure hooks/flow-required.ts (+ test): parse Commands lines, baseline hash, required check.
- hooks/flow-policy.ts Task gets passed-print per kind, baseline map, required list;
  hooks/flow-kinds.ts onCheck records them; hooks/flow-evidence.ts `checked` uses them.
- hooks/flow.ts reads AGENTS.md § Commands once per task start ($.fs.read, read-only) and passes
  the output hash into onCheck; resume prompt → heavy.
- AGENTS.md: the mod also reads `AGENTS.md § Commands`.

## Handoff

Phase 2a of 3 (harness). Roadmap Later items check-compound-kinds and evidence-stale-kind are
covered here; remove them when done.

## Verify

kit:verifier PASS on all criteria (311 mod tests, validate, push-guard 20, codex-hooks 10, shellcheck 24).
Gemini Flash review pass after fixing a stuck baseline, a lint-only excuse and compound contamination.
Known: a red suite with unrecognised failure output gets no baseline and still holds.
