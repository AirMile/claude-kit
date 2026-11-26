<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# model-ladder

Status: building
Backlog: —
Design: —

## Goal

Which helper a chat asks for follows the model it runs on and the room GPT has. A chat on an
expensive model hands reading to cheaper models; a chat on a cheaper model asks a stronger one
when it is stuck or faces a design choice. The chat learns whether GPT has room before it is
pointed there; without room a Claude model takes its place. This spec covers reading and
advice. The main chat's model never changes for it.

## The ladder

```
Max             Sonnet chat        Opus chat          Fable chat
search          Haiku              Haiku              Haiku
research        here               Sonnet             Sonnet
design choice   GPT, else Opus     GPT, else Fable    GPT, else new Fable
stuck           Opus, then Fable   Fable, then GPT    GPT, then ask user

Pro             Sonnet chat        Opus chat
search          GPT, else Haiku    GPT, else Haiku
research        GPT, else here     GPT, else Sonnet
design choice   GPT, else Opus     GPT, else new Opus
stuck           Opus, then GPT     GPT, then ask user
```

- "GPT, else X": X when GPT's window is too full, GPT is off, Codex is missing or the meters
  are unread. "stuck" without GPT room: a new subagent on the strongest model of that plan.
- "research" is wide reading. Small changes, building and review stay as today.
- A Haiku chat searches itself, else follows Sonnet. A Mythos chat follows Fable. An unknown
  model gets no ladder helper. On Pro no helper is Fable, whatever the chat runs on.

## Acceptance criteria

- [x] Happy: every subagent spawn is logged with its type and resolved model, and `/flow`
      shows the counts — check: `claude plugin test .` (`hooks/auto-model.test.ts`,
      `hooks/flow-log.test.ts`)
- [ ] Gate: on 10 search questions with answers fixed beforehand, a Haiku `Explore` subagent
      finds the right file and line at least 9 times. Recorded: the model id that ran, the 5h
      percentage before and after, Sonnet on the same briefs — check: manual, table in Verify
- [ ] Happy: an `Explore` spawn without a model runs on Haiku while a profile is on, decided
      from the spawn's `parentModel`. A model on the call is kept; other subagents and profile
      off behave as today — check: `claude plugin test .` (`hooks/auto-model.test.ts`)
- [ ] Happy: a pure policy returns the helper for every cell of both tables and the three
      footnote cases — check: `claude plugin test .` (`hooks/ladder-policy.test.ts`, new)
- [ ] Happy: the read-budget and decision notes name the ladder's helper: for Claude the
      `Agent` call itself (type, model), for GPT `mcp__kit__delegate` only when the role fits a
      reading at most 15 minutes old, else the reason — check: `claude plugin test .`
      (`hooks/read-budget.test.ts`, `hooks/task-policy.test.ts`)
- [ ] Gate: after such a note the chat makes the named `Agent` call (type and model) in 3 of 3
      fresh runs; repeated for the stuck note once built — check: manual,
      `claude --plugin-dir .`
- [ ] Happy: `mcp__kit__delegate` with a role and no brief runs nothing and answers with both
      GPT windows in percent, their reset times, whether the role fits and whom to brief. No
      read-budget reset, no `delegate` log entry, no review state in flow — check:
      `claude plugin test .` (`hooks/delegate.test.ts`, `hooks/read-watch.test.ts`)
- [ ] Edge: `plan` that GPT cannot take answers with the ladder's Claude route instead of "plan
      here" — check: `claude plugin test .` (`hooks/delegate-policy.test.ts`,
      `hooks/delegate.test.ts`)
- [ ] Edge, unchanged: a V3 review gets no Claude stand-in and its note says it waits for GPT
      or a waiver; a GPT model the user names is never replaced; Gemini only on request —
      check: `claude plugin test .` (`hooks/delegate-policy.test.ts`, `hooks/task-policy.test.ts`)
- [ ] Happy: stuck is the main chat's check failing a third time in a row with code changed in
      between. One note per task names the helper and the fallback; the E3 note names the same
      helper. A rerun on unchanged code, a baseline failure and a subagent's check do not
      count; a compound run counts once; a pass resets — check: `claude plugin test .`
      (`hooks/flow.test.ts`, `hooks/task-policy.test.ts`)
- [ ] Docs match the ladder: README (delegation table, subagent paragraph), the `AGENTS.md`
      layout line, the GPT paragraph of `skills/task-readiness/SKILL.md` (stays at 120 lines or
      fewer), the delegate tool description, the `Explore` line in `hooks/codex-context.md` —
      check: read against the tables; `wc -l skills/task-readiness/SKILL.md`
- [ ] `delegate.ts`, `delegate-policy.ts`, `auto-model.ts` and `flow.ts` end no longer than
      378, 339, 361 and 351 lines — check: `wc -l`

## Out of scope

- Helpers that write code (building from a Fable chat, bulk edits). A later spec, if the log
  shows demand: today a Claude route returns before the writer lock (`delegate.ts`), a
  concurrent GPT run would count the subagent's files as GPT's, and the limit pause can cut a
  writer halfway.
- The main chat's model. The prompt-time question and its subagent note follow the profile,
  not the ladder, so a Sonnet chat can still be offered Fable there.
- New delegate roles; review routing; `kit:verifier`'s model; GPT limit thresholds; Gemini.
- The mod starting Claude subagents itself.

## Approach

- New pure `hooks/ladder-policy.ts`: (parent family, plan, work, GPT fits) → helper.
- Claude helpers need no delegate round trip: `agent.spawn` fills in `Explore`'s model, the
  notes name the rest. A round trip costs a request and writes the brief twice.
- GPT room: `route()` already refuses a full GPT before Codex starts. Missing: note texts
  (`task-policy.ts`, `read-budget.ts`) ignore it, `plan` has no Claude route, `delegate.ts`
  rejects a call without a brief. Tests expecting "plan here" change.
- Stuck counter in `flow-kinds.ts`, note through `flow.ts`.
- Rejected: agents with a fixed model in `agents/` (the spawn hook already sets any model); a
  table injected at session start (context in every chat, stale after `/model`).
- Build order: spawn log → `Explore` on Haiku with its gate → ladder, GPT room, notes, `plan`
  fallback → stuck note.

## Open points

- The `Agent` tool of at least one session (2026-11-26) said not to spawn unless the user asks.
  If the call gate fails: ask the user for a standing permission line; the mod never claims one.
- API prices per MTok in/out (cached 2026-11-03): Haiku 5.5 $0.10/$0.50 up to 100K prompt
  tokens, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Fable 5.2 $8/$40; cache reads Sonnet $0.10, Opus
  and Fable $0.20. Cost against the subscription limit is unmeasured; the mod cannot see
  Fable's weekly share.
- Opus → Sonnet research is doubtful (2× price, cold start). Kept because it keeps the reading
  out of the main chat; judge it from the spawn log.
- The `plan` fallback reverses a choice in `delegate-policy.ts` (a same-family plan adds
  little); from a Fable chat it buys a fresh context only.

## Handoff

2026-11-26: criterion 1, the spawn log, is built and verified; committed on `main` (3fa628f).
The user accepted the table changes the same day. All other criteria are open; the GPT room
criteria are unreviewed. No GPT plan (ChatGPT limit full).

- `hooks/spawn-record.ts` logs every started subagent: type, resolved model, parent model (not
  shown) and `resume`. `/flow` counts them by type and model, resumed runs apart. Spawns have
  their own 2000 entries in the log; `log` (`flow-store.ts`) has one writer at a time.
- Baseline: 0.17.1 is installed for the CLI (`kit@airmile`, this folder). Desktop sessions
  loaded the claude.ai copy (0.16.7 on 2026-11-26), which needs an update there after the
  push; until then they log no spawns.
- Today, seen live: a Haiku chat's `Explore` spawn ran on `claude-sonnet-5-5`.

Next: update the desktop copy, collect a baseline, then `Explore` on Haiku with its gate.

Limits of the log (accepted, from two reviews):
- Not logged: a forked skill (it raises no `agent.spawn`), a spawn where kit's hook fails
  before the subagent starts, a workflow agent's retry. A hook beneath that answers without
  starting one is logged.
- An entry can be lost: `/flow mark` writes outside the queue, other processes sharing the
  store are not serialized, an interrupted writer may drop its batch, and a stalled store write
  stops later logging in that process (no other hook waits on it).
- A resumed agent whose first spawn is not in the log is in no count. Teammate types are free
  text.
- A subagent's profile effort is now set before flow binds review evidence (earlier than
  before; no test drives it to `turn.step`).

## Verify

Baseline 2026-11-26 on `main` 4bff5c4: `claude plugin test .` 544 pass, 0 fail (45 files).

Criterion 1, 2026-11-26 (Claude Code 2.1.317): `claude plugin test .` 555 pass, 0 fail (45
files), the new tests seen failing first. `claude plugin validate` (scratch copy and root),
`push-guard`, `codex-hooks` and `fixtures-shellcheck` tests pass; `tsc` 5.6.3 errors in non-test
files identical to `main`. `wc -l`: `auto-model.ts` 350, `flow.ts` 351. Two fresh Fable reviews
(no GPT room): the first passed with three P2s, fixed; the second passed with P3s only (the
limits above). Live, headless `claude -p --plugin-dir .`: the debug log shows
`{"event":"spawn","text":"Explore","model":"claude-sonnet-5-5","parent":"claude-haiku-5-5"}`
and the entry is in the `kit_inline` store (likely the one desktop sessions use too: one test
entry in the baseline).
