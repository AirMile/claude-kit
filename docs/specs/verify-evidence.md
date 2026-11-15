<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# verify-evidence

Status: done
Design: —

## Goal

The flow gate stops accepting any passing check as proof. Today a failing test run followed by a
green lint run ends as "verified" (`hooks/flow-evidence.ts:213-235`: a failure wipes evidence, the
next pass of any kind restores it). Evidence becomes per kind of check (test, typecheck/lint,
build), and the gate recognises the checks of more ecosystems. Increment 1 of 2; increment 2 is
`verify-tools`. Advised blind by Astra, Gemini and Fable (all three: fix the evidence first).

## Acceptance criteria

- [x] Happy: a failing check opens its kind (`test`, `static` for typecheck/lint, `build`). A later
      pass of the same kind closes it. The task counts as checked only when a check passed on
      the current code and no kind is open: failing tests then a green lint stays open.
- [x] Edge: a task that never failed behaves as now (one pass on the current code is enough);
      fail, edit, pass of the same kind still verifies; a failure in an unchanged kind after the
      pass re-opens it; open kinds survive a reload and end with the task (`/clear`, waive).
- [x] Happy: `RUNNER` also recognises `ng build|test|lint`, `dotnet build`, `mvn compile`,
      `phpstan`, `psalm`, `golangci-lint`, `staticcheck`; each existing runner gets a kind.
      A command naming no known runner is still no check (`echo test`, `cat x.test.ts`).
- [x] Happy: the hold text and `/flow`'s open line name what is open ("tests failed earlier:
      run them again on this code"), not only "a passing check".
- [x] Edge: a `run_task` check argv gets its kind the same way as a Bash check.

## Out of scope

- Security, dead-code and duplication tools in the gate (they live in `Security:`/`Quality:`
  commands, `verify-tools`); requiring a behaviour check (test/visual) at V2+; per-edit scans.

## Approach

- `hooks/flow-check.ts`: `RUNNER` becomes `[kind, pattern]` pairs; `Check = { piped, kind }`;
  `checkOf` and `isCheckArgv` keep their callers (`flow.ts:289`, `task-runner.ts:127`,
  `read-budget.ts:6`); `flowCheckStart` gets the kind through to `flowCheckEnd`.
- `hooks/flow-policy.ts`: `Task.openKinds: CheckKind[]` (default `[]`, loads as `[]` when absent).
- `hooks/flow-evidence.ts`: `onCheck(task, passed, startedAt, startPrint, kind)` as above;
  `checked()` also needs `openKinds` empty; `missing`/`holdText`/`openLine` name the kinds.
- `hooks/flow.ts`: pass the kind from `checkOf` / `isCheckArgv` to `flowCheckEnd`.

## Tests

- `hooks/flow-check.test.ts`: kinds per runner, the new runners, non-checks.
- `hooks/flow-evidence.test.ts`: criteria 1, 2, 4 (fail test then pass lint; fail, edit, pass).
- `hooks/flow.test.ts`: reload keeps `openKinds`; `/clear` ends them; `run_task` argv kind.

## Open points

- A kind opened by a failure the user no longer cares about is cleared only by a pass or
  "skip verify". Accepted: the alternative (any pass restores) is the bug.

## Handoff

Done 2026-11-16, not committed. Round 1 built by one `run_task` brief (GPT Sol 6.1). After GPT
Astra and Gemini reviews (both `fail`) rounds 2-3 were built here because GPT had no room: new
`hooks/flow-kinds.ts` (onCheck, reopen), `failedAt` (only rises), `closedKinds`/`closedPrints`
(a pass on other code reopens closed kinds), `Check.kinds` for `&&` commands, bare yarn, vendor/bin
and more runners. `flow.ts` is 309 lines (soft limit ~300). The live gate needs a version bump:
the installed copy still runs the old code. A task stored by the previous build has no
`closedPrints`, so it keeps the old Bash-edit gap until it ends.

## Verify

2026-11-16 · suite 286 pass / 0 fail (baseline 271), detect-tools 95+, push-guard 20/20,
codex-hooks 10/10, `claude plugin validate .` passes; tsc: no error in the changed source files
(only the pre-existing read-watch.ts and test/fixture typing).

- kit:verifier x4: 5/5 pass each; the last on the final code, with 2 mutations and an adversarial
  S6 scenario (a Bash/formatter edit then a lint pass), now fixed by `closedPrints`.
- Reviews of other families (author gpt): Claude Sonnet `pass` (round 1, round 3 with a 20,000
  sequence fuzz), Gemini `fail` r1 and r2, `pass` r3 and on the final delta; GPT Astra `fail` r1
  and r2, round 3 not finished (usage limit). Astra's and Gemini's P1s were verified against the
  code before fixing: injection via a .sln name, gate not recognising detect-tools commands, stale
  pass closing a newer failure, bare yarn, compound commands, failedAt lowering.

Improvement notes (for Later) are on the roadmap.
