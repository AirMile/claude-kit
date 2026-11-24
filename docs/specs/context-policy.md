<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# context-policy

Status: manual
Design: —

## Goal

The main chat compacts itself at a task boundary, so the user never has to watch the context
window: when a turn ends with no open flow task and not on a question, and the context is at or
above min(50% of the window, 160k tokens), kit runs `/compact` once the session is idle. Every
compaction is recorded so the threshold can be tuned from data.

## Acceptance criteria

- [x] At a boundary with context ≥ min(50% window, 160k) the mod runs `compact` after the turn
      (via `$.command.run`, outside the hook) — check: `claude plugin test .` (auto-compact.test.ts)
- [x] No compact while a flow task is open, after a turn that ended on a question, after an
      aborted or errored turn, for a subagent, when a fresh start is armed, or within 3 turns of
      the last compaction — check: `claude plugin test .` (context-policy.test.ts, auto-compact.test.ts)
- [x] `/autocompact off` stops it for this project (kept in `$.store`), `on` restores it,
      `status` shows the state, the threshold and the latest ledger rows — check: `claude plugin test .`
- [x] Every completed compaction (native auto, manual, kit's own) appends one row (time,
      trigger, auto by kit, tokens before/after) to a per-project ledger in `$.store`, capped at
      50 rows — check: `claude plugin test .`
- [x] A failing `compact` command shows one toast and turns the policy off for this chat
      (until `/clear` or `/autocompact on`); a "turn is running" refusal just skips — check: `claude plugin test .`
- [x] Typecheck and mod load stay green — check: `npx -y -p typescript@5.6.3 tsc --noEmit -p .`
      and `claude plugin validate` in a scratch copy (AGENTS.md § Conventions)

## Out of scope

- Pruning or rewriting old tool results (`context-prune`), clearing instead of compacting
  (`fresh-anywhere`), a band button, per-tool character measurement (rest of `context-ledger`).

## Handoff

Built and verified in code; waiting on one live auto-compact in the app (Verify). Deviations
from the first design: the cooldown counts the mod's own main-chat turns (`$.session.turns()`
drops after a compaction), and an epoch (prompt, turn start, /clear, any compaction) voids a
stale boundary or planned compact. Question detection is kit's own `endsOnQuestion`; flow's
`endedOnQuestion` is unchanged (roadmap Later: flow-question-detect).

## Verify

Baseline: `claude plugin test .` 360 pass, 1 fail (`hooks/limit-guard.test.ts` declares no
test(): pre-existing); tsc 5.6.3: 7 non-test errors in guard.ts/read-watch.ts, unchanged.
Now: 389 pass, same 1 fail; validate passed in a scratch copy. kit:verifier: PASS (2nd round);
GPT Sol review: pass (3rd round). Mutation-checked: epoch per turn and prompt, mainTurns,
endsOnQuestion, skip cooldown. Known limits: the "turn is running" skip is unit-tested only
(command.run queues, so it is probably never reached); `kit` in the ledger assumes
command.run resolves after the compaction.

Manual (pending): with the updated plugin, run `/autocompact status`, work past the
threshold, ask something that changes no files and whose answer is no question → toast
"kit: task done … compacting" and a compaction; `/autocompact status` shows a newest "kit"
row; the next two such prompts start no compaction.
