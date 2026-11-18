<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# task-readiness-core

Status: verifying
Design: —

## Goal

Replace the auto-routed, step-by-step `/build` with `task-readiness` as the core: a clear goal,
tools, one exact check per criterion, stop points; then the model works freely. Infrastructure
(the checks and the Stop gate) enforces, text does not. Delegation to GPT stays, so both
subscriptions are used. Phase 1 of 3 (2: harness: baseline in the mod, checker-file guard,
commit gate; 3: planning moves to Obsidian TaskNotes).

## Acceptance criteria

- [x] `skills/build` is gone; `grep -rIn "kit:build\|/build" skills hooks agents` finds nothing
      outside historical `docs/specs/*` and `docs/roadmap.md`.
- [x] `skills/task-readiness/SKILL.md` ≤ 120 lines, model-invocable, does not wait for a go when
      goal is confirmed and Open is "none"; keeps baseline, repro-first for bugs, independent verify.
- [x] The heavy flow note names `kit:task-readiness`, not a build path; commits nothing unasked.
- [x] A heavy task without a spec still requires the verifier before the turn counts verified.
- [x] Stale evidence still fails the gate; failed tests + green lint still cannot close.
- [x] Delegation notes (who executes: Claude or GPT, by both 5h meters) are unchanged.
- [x] Spec resume paths (fresh_start, compaction, roadmap pane launch) point to
      `/task-readiness <slug>` and their tests pass.
- [x] `claude plugin validate .`, push-guard, codex-hooks and fixtures-shellcheck tests pass;
      `claude plugin test` on a scratch copy of the mod passes.

## Out of scope

- Planning in Obsidian, removing the roadmap pane, specs parser, claims (phase 3).
- Baseline-in-mod, checker-file guard, commit gate from angular-port-kit (phase 2).

## Approach

- skills/task-readiness: rewrite; spec template moves to its `references/`; debug ladder
  condensed into a short bug paragraph. Delete skills/build. Repoint other skills and docs.
- hooks: flow-policy NOTE.heavy; `needsVerifier` no longer needs a spec; drop `build` as a
  special input in flow, flow-prompt, model-policy; repoint fresh-start, compaction,
  roadmap-view/worktree/parts/card to `/task-readiness`. Keep task-policy delegation notes.
- agents/verifier.md: criteria from the spec when there is one, else from the task text.
- evals: rewrite build-* as task-readiness cases; update convert/knowledge-conflict prompts.

## Tests

- hooks/flow*.test.ts, model-policy.test.ts, compaction.test.ts, roadmap-worktree.test.ts,
  auto-model*.test.ts updated; a new case: heavy + no spec still needs the verifier.

## Handoff

Specs for this rebuild: user approved phase 1; condition: delegation to GPT stays.

## Verify

kit:verifier PASS on all 8 criteria (twice, the second on the final code): 290 mod tests, validate,
push-guard 20, codex-hooks 10, shellcheck 24. GPT review pass; Claude review of the GPT-written mod
code pending. Not run: the two new evals, `$.command.run` with a slug in the real host.

## Fixes
