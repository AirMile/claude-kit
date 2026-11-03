<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# task-runner

Status: done
Design: —

## Goal

The chat hands one change brief plus the covering check(s) to a new tool,
`mcp__kit__run_task`. The mod runs GPT's build, runs the checks itself on the host and feeds
a failing check back to the same Codex thread. It returns one short result. The chat stops
spending context on the build→check→fix loop, and the check result is the mod's own
observation, not GPT's report. Increment 2 of task-systems.

## Acceptance criteria

- [x] Happy: `run_task({brief, checks: argv[][] (1-3), role?: build|build+})` routes like
      delegate's build role, runs Codex once, then runs each check with `$.process.run` (no
      shell, session root, ≤ 10 min each). Result ≤ 4000 chars: status (pass / failing /
      stopped / not run), model + thread, rounds, changed files, per-check exit code, GPT's
      final message cut to 1500 chars, what's left (review the diff; V2+ → delegate review).
- [x] Happy: a failing check → the same thread gets a fix brief with that check's argv + the
      last 60 output lines; all checks run again. At most 2 fix rounds; still failing →
      status `failing` with that tail, never "pass".
- [x] Edge: every check result reaches flow the way a Bash check does (onCheck with the start
      fingerprint, first failure raises the levels), GPT's files per round via flowDelegated;
      the log records run_task as a GPT run, so the E1+ → GPT-run ratio in `/flow` counts it.
- [x] Edge: not started (no Codex run, no check) for an empty brief or checks, GPT off, Codex
      missing, a Claude/none route, or another writing GPT run (lock shared with delegate);
      the reason is stated.
- [x] Error: a Codex error, a check that can't start or times out, or the 30-min total
      deadline → stop, status `stopped` with round, files and error so far; the lock is
      released.
- [ ] Safety: tool.check never auto-allows run_task (its checks run outside Codex's sandbox,
      as the host user): the normal permission prompt shows the argv. The E1/E2 decision
      notes in task-policy name run_task with the covering check instead of delegate build.

## Out of scope

- Review inside the runner (author gpt routes to a Claude subagent, which the mod doesn't
  start): the result says what's left. V2/V3 enforcement is `task-verify`.
- A research step, D3, refactor (`task-depth`); scope paths / stopping on changes outside
  them; the mod finding the check command (the chat passes it).

## Approach

- `hooks/delegate-run.ts` (new): delegate's GPT run (status, route, writer lock, runCodex,
  changed files) as a structured result; `delegate.ts` formats it (≈ -110 lines). Behaviour
  of delegate unchanged.
- `hooks/task-runner-policy.ts` (new, pure): fix brief, output tail, status and result text,
  stop rules. `hooks/task-runner.ts` (new): tool spec, loop, checks, deadline, tool.check.
- `hooks/flow.ts`: one shared check-recording path for Bash and the runner; the `/flow`
  command moves to `hooks/flow-command.ts` (flow.ts under ~300 → makes Later `flow-split`
  obsolete).
- `hooks/read-watch.ts`: log run_task like delegate. `hooks/task-policy.ts`: E1/E2 notes.
  `hooks/register.tsx`: register the tool.
- AGENTS.md: mod contract (Codex starts also for run_task; the mod runs the checks the chat
  passes to it) + layout line; README.

## Tests

- `hooks/task-runner-policy.test.ts` (new): fix brief, tail, status per outcome, round limit.
- `hooks/task-runner.test.ts` (new, process.spawn/run bottom hooks like delegate.test.ts):
  pass; fail → fix → pass; still failing; not-run guards; Codex error and timeout release the
  lock; flow sees the check.
- `hooks/delegate.test.ts`, `delegate-reliability.test.ts` stay green (extraction).
- `hooks/task-policy.test.ts`, `read-watch.test.ts`: note text, log entry.
- Permission prompt by hand with `claude --plugin-dir .`.

## Open points

- Fix rounds: 2 (same as /build's verify) chosen over 1 (Sol: cheaper, stricter).
- Sol: re-ask permission after every repair, plus scope paths. Not taken: one prompt per tool
  call shows the argv, and the chat sees the changed files.

## Handoff

Built 2026-11-02 via 4 delegate build+ briefs (Sol 6.1), each diff reviewed here; nothing
committed (kit flow heavy: commit only when the user asks). Baseline was 168 pass / 0 fail;
now 204 pass / 0 fail, tsc clean outside `*.test.ts`, mod validates in a scratch copy.

- `delegate-run.ts`: routeDelegation / acquireWriter+releaseWriter / runDelegated; the
  runner holds the lock over all rounds. `flow.ts`: flowCheckStart/End shared with Bash,
  flowLevels; `/flow` moved to `flow-command.ts` (flow.ts 296 lines).
- `task-runner.ts` declares `McpToolInputs.mcp__kit__run_task` in the generator's exact
  shape: `.claude-plugin/types/claude-code-mcp` is generated per machine (gitignored) and
  lacks the tool until a save with it connected; a differently written type would clash.
- Test fixtures split out (`task-runner-fixture.ts`, `read-watch-fixture.ts`) for line size.
- Closed 2026-11-03: off the roadmap at the user's request. Criterion 6 stays unchecked: its
  dialog was never observed and the user skipped it, since they don't work in Ask mode. The
  rest moved to Later: `flow-split` dropped (flow.ts is 295 lines), improvement notes and
  `build-run-task` added, plus `run-task-auto` for what auto mode means for criterion 6.

## Verify

2026-11-02 · kit:verifier: criteria 1-6 pass on code + tests; criterion 6's real prompt is
manual. Other-family review (Claude Sonnet; the code came from GPT): no P0, one P1.
Fix round 1 (done here; 209 pass / 0 fail, tsc clean outside tests, mod validates):

- P1: the runner recorded every argv in flow, so `["true"]` would open the verify gate.
  Now only an argv `isCheckArgv` (flow-check.ts, the same runner list as Bash, no `;`/`|`
  splitting since there is no shell) is recorded; tests for `true`, `echo "x; vitest"`.
- A check passing right at the 30-min deadline made the run `stopped`: now only a check the
  deadline skipped stops it (tests: pass at the deadline, deadline between two checks).
- A Codex error in round ≥ 2 showed the previous round's check lines: cleared per round.
- `flowLevels` failing after the lock release no longer loses the result.

Manual · permission prompt (criterion 6): skipped 2026-11-02, since `claude --plugin-dir .`
ran on API billing, which the user doesn't want. Criterion 6 stays open until it can be
checked on the subscription (e.g. after installing a bumped version).

Re-verify after fix round 1 (kit:verifier): automated criteria PASS, 209 pass / 0 fail;
isCheckArgv checked on real argvs (`echo "x; vitest"` no, `npx vitest run` yes).

Manual · permission prompt, 2026-11-03: skipped by the user, so no dialog was observed. Two
empty-brief calls ran in auto (`get_session`) and showed no prompt, which proves nothing: there
an ask goes to the classifier (`index.d.ts:13444`). A third call ran in `default`; the user
skipped judging it. In code: no `tool.check` for run_task, no allow rule in the settings read.

Improvement notes (now under Later):

- The permission test registers its own "ask" handler, so it can't fail if an allow is
  added later: assert that no tool.check is registered for run_task instead.

- `pass` while GPT changed nothing: say "pass, no changes" or stop.
- A timed-out check may keep running (`$.process.run`'s contract doesn't say it kills the
  child); timeout vs "could not start" is guessed from elapsed time and the message.
- read-watch counts a `stopped` run where Codex never started as a GPT run (and resets the
  read budget); tail is stdout+stderr concatenated, so stderr-biased.
