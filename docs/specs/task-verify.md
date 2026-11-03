<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# task-verify

Status: done
Design: —

## Goal

The flow gate reads the task's Verify level, so V2/V3 are enforced on small tasks too instead of
only being mentioned in a note. Work without its evidence no longer ends up closed as if it were
finished: it stays open across prompts until it is verified or the user waives it. Increment 3
of task-systems.

## Acceptance criteria

- [x] Happy: a V2 task on any track, spec or not, closes only with a passing check and a passing
      review on the current worktree. The hold names everything missing at once (check, review,
      verifier). The level is `max(task's V, heavy → 2)`, so a task without levels still gets a
      floor. V0/V1 only need the check, as now; heavy+spec still also needs the verifier.
- [x] Happy: review evidence is one of: `mcp__kit__delegate` role review run by GPT; an Agent
      subagent whose prompt carries the review footer (the Claude route); a `kit:verifier` PASS.
      The reviewer's family must differ from the writer's: GPT counts unless only GPT wrote,
      Claude counts only if GPT wrote something. Evidence counts for the worktree the review
      started on.
- [x] Edge: V3 also needs a non-empty `failure-paths:` line. `verdict: fail`, no verdict line, a
      run error, the same family or a later edit give no evidence, and the hold says which one
      applied. The verdict is read before the answer is truncated.
- [x] Edge: a failing check still raises the levels in the note, but not the level the gate
      demands, so a test-first red run doesn't force a review. Growth does raise the gate.
- [x] Happy: changed and unverified work stays open. A new change request folds into it (track
      and levels take the maximum, files are merged; the file-count escalation and the two-holds
      cap count per request). Any other request keeps it, with a reminder once per round of
      changes: what's missing and how to waive it. `/flow` shows the open task and what it
      misses. New tasks no longer end as `unverified`/`unresolved`.
- [x] Edge: the user is never stuck. "skip"/"sla verificatie over" ends the task as `waived` at
      the next request, never as verified. A review that comes back "Not delegated" gives no
      review hold in that round, and the task stays open with the reason. A turn ending on a
      question still passes, holds stay at one per round, and `/clear` ends the task as `reset`.

## Out of scope

- D3 council and refactor levels (`task-depth`); standalone Codex sessions; the mod starting a
  reviewer itself; judging how good a review is (that stays the reviewer's call).

## Approach

- `hooks/flow-evidence.ts` (new, pure): `missing(task, print)`, verdict parsing, family rule,
  hold and reminder text. `flow-policy.ts` calls it from `verified`/`stopVerdict`; `onPrompt`
  folds; `SKIP` also matches "sla … over" and review wording.
- Task gets: `gateV`, `gptWrote`, `claudeWrote`, `review` (result, start print and time, family,
  depth), `noReviewer` (round, reason), `remindedRound`, `requestFiles`.
- `hooks/delegate-run.ts`: review footer starts with `verdict: pass|fail` (fail = P0/P1) and asks
  for `failure-paths: …`. `delegate.ts` reports the GPT result or "Not delegated" to flow.
  `delegate-policy.ts`: the "checks and the verifier cover it" text goes.
- `hooks/auto-model.ts`: `flowSpawned` also takes the prompt and start print (review footer
  recognised; the verifier's evidence also binds to its start print).
- `hooks/flow.ts`: split off the agent and review glue (`flow-agents.ts`) to stay under ~300
  lines. Also `flowRecovery`, `flow-levels.ts` (gate level on growth), `flow-log.ts` +
  `flow-command.ts` (`waived`, open-task line). `task-policy.ts`: V2/V3 note text. AGENTS.md
  layout line.

## Tests

- `hooks/flow-evidence.test.ts` (new): every rule of criteria 1-3.
- `hooks/flow-policy.test.ts`, `flow.test.ts`: red run stays V1, folding, reminder once, waived,
  no reviewer, hold bounds, reload keeps evidence.
- `hooks/delegate.test.ts`, `delegate-policy.test.ts`, `read-watch.test.ts`,
  `auto-model.test.ts`: footer, result to flow, spawn with marker.

## Open points (decided at accept)

- Folding over parking (Sol): evidence is per worktree, so one check and review at the current
  state covers both, with far less state. A small tweak after unverified V3 work also needs V3
  evidence.
- Mixed authorship: a review from either family counts (Sol wanted both).
- GPT off on Claude-written code: V2 stays open until "skip", one reminder per round (not closed
  as `unreviewed`).
- The hold cap counts per request (Sol: per task, but then new folded work is never held).

## Handoff

Done 2026-11-03. Built via 3 run_task briefs plus 2 fix rounds (GPT Sol 6.1 and Terra 6.1), each
diff reviewed here. The live gate needs a version bump: the installed copy still runs the old
code, so no real session has run it yet. Beyond Approach: `flow-state.ts` holds the task for
`flow.ts` and `flow-agents.ts`; fixtures split out for line size.

Choices within the criteria: a verifier PASS never satisfies V3, its output has no
`failure-paths:` line. A pass counts only on the answer's first content line, a fail on any
line. A fold also gets the reminder, once per round.

## Verify

2026-11-03 · suite 248 pass / 0 fail (baseline 209), push-guard 20/20, codex-hooks 10/10, mod
validates in a scratch copy. tsc: only the pre-existing errors in `hooks/read-watch.ts` (19, 20,
31), an unchanged file; errors in tests and fixtures are expected.

- kit:verifier, 3 runs: 6/6 pass each, the last on the final code. Run 1 also mutated a scratch
  copy: gate level, family rule, staleness, review hold, hold cap, waived, noReviewer, question
  exemption and requestFiles each made tests fail.
- Claude Sonnet review, 2 runs (the code came from GPT; author gpt): no P0/P1. Both ran on
  earlier code: round 2's diff was checked by the verifier, not by a separate review.
- Round 1: a current fail review beats a verifier PASS; an inconclusive result keeps a pass;
  footer hint on holds; parser tolerance; `kind` out of the record; `/clear` reset test.
- Round 2: false pass from prose fixed (first content line, stricter word boundary); fail
  sticky; a run error with `verdict: fail` stays fail; V3 needs a real review record; staleness
  before outcome; `None.` and `<...>` are no depth.

Improvement notes (for Later):

- `hooks/flow-evidence.ts:parseReview`: accept `Verdict: **pass**` (bold on the word only reads
  as no verdict, which costs an extra review).
- `hooks/flow-agents.ts:spawned`: entries for agents that never answer stay in memory, and
  `flowSpawned` has no try/catch around work done after the agent has started.
- `hooks/delegate.ts`: any Codex `error` event discards a review whose answer was complete
  (recorded as `error`, unless it says `verdict: fail`); not confirmed that transient errors occur.
