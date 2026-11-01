<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# task-runner

Status: defined
Design: —

## Goal

The chat hands one change brief plus the covering check(s) to a new tool,
`mcp__kit__run_task`. The mod runs GPT's build, runs the checks itself on the host and feeds
a failing check back to the same Codex thread. It returns one short result. The chat stops
spending context on the build→check→fix loop, and the check result is the mod's own
observation, not GPT's report. Increment 2 of task-systems.

## Acceptance criteria

- [ ] Happy: `run_task({brief, checks: argv[][] (1-3), role?: build|build+})` routes like
      delegate's build role, runs Codex once, then runs each check with `$.process.run` (no
      shell, session root, ≤ 10 min each). Result ≤ 4000 chars: status (pass / failing /
      stopped / not run), model + thread, rounds, changed files, per-check exit code, GPT's
      final message cut to 1500 chars, what's left (review the diff; V2+ → delegate review).
- [ ] Happy: a failing check → the same thread gets a fix brief with that check's argv + the
      last 60 output lines; all checks run again. At most 2 fix rounds; still failing →
      status `failing` with that tail, never "pass".
- [ ] Edge: every check result reaches flow the way a Bash check does (onCheck with the start
      fingerprint, first failure raises the levels), GPT's files per round via flowDelegated;
      the log records run_task as a GPT run, so the E1+ → GPT-run ratio in `/flow` counts it.
- [ ] Edge: not started (no Codex run, no check) for an empty brief or checks, GPT off, Codex
      missing, a Claude/none route, or another writing GPT run (lock shared with delegate);
      the reason is stated.
- [ ] Error: a Codex error, a check that can't start or times out, or the 30-min total
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

Spec accepted 2026-11-02 (2 fix rounds). Research (Sol, thread 01a19969…) and blind plan
(Sol, thread 01a1996b…) agree on a separate tool + extracting delegate's run. Next: run the
full suite as baseline, then extract `delegate-run.ts` first (delegate tests must stay green),
then the pure policy with its test.

## Verify

—
