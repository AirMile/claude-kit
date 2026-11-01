<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# task-systems

Status: manual
Design: —

## Goal

Every typed request gets a routing decision over four systems (Define, Execute, Verify,
Refactor), each with its own level, instead of one model+effort pick. GPT becomes the default
worker for bounded work, Claude the conversation partner and final editor, and quality never
drops silently under budget pressure. Increment 1 of 4 (roadmap below): the decision, its note,
the band and the log. Reviewed by Astra and Sol (both: replace the T0-T4 ladder with separate
axes; a note alone does not prove more GPT work, hence increment 2).

## Systems and levels

```
Define   D0 answer directly   D1 goal + bounds + testable outcome
         D2 GPT researches code/alternatives   D3 two blind proposals (Sol+Astra) + critique
Execute  E0 main chat (one-line tweak, short answer)   E1 one GPT worker (default)
         E2 stronger GPT worker, split briefs   E3 parallel analysis, one writer per checkout
Verify   V0 check answer/sources   V1 covering check or visual look
         V2 independent reviewer (other family)   V3 adversarial: failure paths, integration
Refactor R0 skip (default)   R1 local simplification   R2 separate design + change
```

## Acceptance criteria

- [x] Happy: a typed prompt gets D/E/V/R levels from a pure policy over the existing labels
      (kind, change, explore) plus one new Haiku label for verify need (cosmetic / behaviour /
      shared code / risky: migration, auth, data loss), and one short decision note: levels, who
      executes, next action, required evidence. The band shows the levels (e.g. `D1 E1 V1`).
      The note is left out for all-zero levels and, within an open task, when no level rises
      (the levels are still decided and logged).
- [x] Happy: a bounded change routes to E1 (GPT via `mcp__kit__delegate` build); E0 only for a
      one-line tweak or a direct answer. The delegate sentences leave the flow notes (one place).
- [x] Happy: an explicit ask ("met z'n drieën/vieren", "laat sol en astra meedenken",
      "council") sets D3 for that prompt.
- [x] Edge: budget pressure lowers parallelism and Execute (GPT tight → E0; no Astra room →
      D3 becomes D2) but never Verify; the note names the reason.
- [x] Edge: a thin reply keeps the open task's levels without a new note; flow growth or a
      failing check raises E and V by one.
- [x] Happy: each decision is logged with both 5h meters; `/flow` shows counts per level and
      how many E1+ decisions really led to a GPT run (the proof increment 2 needs).

## Out of scope (next roadmap items)

- `task-runner`: Claude submits one brief, the mod runs GPT steps itself, observes and
  returns a short result (changes the mod contract in AGENTS.md: Codex starts).
- `task-verify`: V2/V3 enforced by the flow gate for small tasks too (verifier now only heavy +
  spec, `flow-policy.ts:84`); work stays open instead of passing unverified (`:288`).
- `task-depth`: D3 council in one tool call, and R1/R2 refactor with re-verify.

## Approach

- `hooks/task-policy.ts` (new, pure): levels, `decide(labels, meters, explicit, prev)`, note text.
- `hooks/flow-prompt.ts`: add the verify-need classifier to the parallel batch; call `decide`;
  its note replaces `exploreNote` (explore label becomes an input).
- `hooks/flow-policy.ts`: drop delegate sentences from light/medium notes.
- `hooks/flow.ts`, `hooks/flow-store.ts`: keep levels on the open task; log with meters.
- `hooks/flow-log.ts`: per-level counts and E1+ → GPT-run ratio in `/flow`.
- `hooks/kit-band.tsx`: levels cell. README + AGENTS.md layout line.
- `hooks/flow-levels.ts` (new): flow's levels side (decide, raise, log, band cell), split off
  so `flow.ts` stays near ~300 lines. `hooks/balance.ts`: `balanceMeters()` for the log.
  `hooks/explore-first.ts` keeps only `EXPLORE_LABELS`; `explore-first.test.ts` is gone.

## Tests

- `hooks/task-policy.test.ts` (new): every level rule, explicit ask, budget (Verify never
  lowered), thin reply, escalation.
- `hooks/flow-policy.test.ts`, `hooks/flow.test.ts`: note per decision, log, ratio.
- `hooks/auto-model.test.ts`: a typed prompt carries the decision note.
- Band by hand with `claude --plugin-dir .`.

## Open points

- Fresh Claude reviewer when main runs Opus: Sonnet (fresh context is the value; GPT already
  brings the other family). Applies in `task-verify` when GPT wrote the code.
- Astra/Sol costs (18 / 3-9 points of GPT 5h, one measurement) are hypotheses: thresholds
  start loose and are tuned from the log.

## Handoff

Built and verified (see ## Verify); left: the manual band check, then Finish. Not committed
(flow started this; commit only when Miles asks). The working tree also
holds unrelated uncommitted Codex work (codex-run.ts, delegate.ts, gpt-command.ts,
band-menus.tsx, register.tsx, skills/codex, codex-find/-window/-state): don't mix it into this
feature's commit. This feature's files: task-policy.ts (+test, written by GPT Terra, reviewed),
flow-levels.ts, flow.ts, flow-prompt.ts, flow-policy.ts, flow-log.ts, explore-first.ts (test
deleted), balance.ts, kit-band.tsx, tests auto-model/flow/flow-policy/read-watch, README,
AGENTS.md, this spec, roadmap line.

Choices within the criteria: E0 "one-line tweak" = change light + verify cosmetic (no separate
classifier). Explore classifier runs only when GPT is ready (as before). A failing check raises
the levels once per task (first failure); every flow growth raises them. Astra room = GPT ready
and 5h pct + `ASTRA_COST` (18) < 80. Refactor is always R0 in this increment. The E1+ → GPT-run
ratio counts a `delegate` entry with provider gpt between a decision and the next one.

Checks: `claude plugin test .` (167 pass), typecheck with cached tsc (`~/.npm/_npx/*/…/tsc
--noEmit -p .`, `npx -y` hangs here; errors only in *.test.ts), `claude plugin validate` on a
scratch copy (hooks, skills, agents, .claude-plugin), push-guard + codex-hooks tests. Verify
first: the note gating in `flow-levels.ts` `promptLevels`, the raise in `flow.ts` (`raise`,
Bash hook). Band cell by hand with `claude --plugin-dir .` is the manual item.

## Verify

Verifier (fresh context): 6/6 pass; suite pass (167 then), push-guard 20/20, codex-hooks 10/10,
tsc clean outside *.test.ts. GPT Sol review: no P0/P1; P2s fixed in round 1: a `/build` now
gets the verify classifier (risky → V3) and never counts as a thin reply; growth through a
follow-up prompt raises E/V by one (`promptLevels` `grew`); the first failing check's raise
note rides on the Bash result. Test added in flow.test.ts. After fixes: 168 pass, tsc clean,
validate pass. Not changed (by choice): a thin reply logs no new decision (it is the same
decision); the band cell shows nothing after a reload until the first flow event.

Second verifier run after the fixes, on the final code: 6/6 pass, suite pass (168),
push-guard 20/20, codex-hooks 10/10, tsc clean outside *.test.ts. The three fixes were each
checked with evidence.

Improvement notes:

- `hooks/read-watch.test.ts` council test: the title promises the D2 fallback, but the body only
  asserts D3 (the fallback is covered in task-policy.test.ts): rename it or add the case.

- `hooks/flow.ts` is 324 lines against the ~300 budget: move more glue to `flow-levels.ts`.
- No test asserts `claude5h` in the decision log (the code reads it like `gpt5h`).
- The budget reason says "GPT has no room" also when GPT is switched off in the band.

Manual: the band's levels cell in a real terminal (`claude --plugin-dir .`): skipped
(2026-11-01). Miles judges it in daily use over the coming days; Finish after that.
