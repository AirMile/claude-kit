<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# flow-gate-clarity

Status: building (slice 1 built and verified; slices 2-3 and investigations open)
Design: —

## Goal

A real task in `angular-port-kit` (2026-11-19) showed the flow and the commit gate holding a commit for hours although the suite, the verifier and an other-family review had all passed on the current code. Cause, found by reading and by running `checkOf`: `node --test test/*.test.mjs` (Node's built-in runner) is not recognised as a check, so no check was ever recorded and "a passing check on this code" could never clear. The hold text gave no hint of that. Fix the recognition, make a project's declared commands count, and make the hold say what it needs in terms the user can act on.

Evidence, `checkOf` on Windows with Node 24:

- `node --test test/*.test.mjs` → undefined; `cd x && node --test … > f.log 2>&1; echo exit=$?` → undefined
- `node test/a.test.mjs` → test; `npm test` → test
- The cause is the runner table, hooks/flow-check.ts: `node\s+\S*\.test\.[cm]?[jt]s` needs a path with `.test.` right after `node `; `--test` comes first.
- `parseRequired` (hooks/flow-required.ts:44-46) silently drops a `Test:` command that `checkOf` does not recognise, so the project's own `AGENTS.md § Commands` could not repair it either.

Corrections to my own first guesses: the fingerprint is content-based (hooks/flow-store.ts:63, git blob ids), not mtime, so a mutate-and-restore does not invalidate evidence; and the Stop hook's "and 2 more" did list the first three file names (flow-evidence.ts `short`).

## Acceptance criteria

Slice 1 (what the gate sees):

- [x] `checkOf` recognises Node's built-in runner as kind `test`: `node --test`, `node --test test/*.test.mjs` (one space then a glob), `node --experimental-test-coverage --test x`, `node --import ./setup.mjs --test x`, `NODE_ENV=x node --test`, behind `cd x &&`. Not recognised: `node --version`, `echo node --test`, `node -e "…"`/`--eval`/`-p` anywhere before `--test`, `node --test-only`, `node --test-reporter=x` (without a separate `--test`). Check: cases in hooks/flow-check.test.ts run through the assembled `RUNNERS` matcher (the boundary after `--test` is a lookahead, consumed once: RUNNERS already appends its own `(?:s|$)`); `claude plugin test .`.
- [x] A masked exit status never credits a pass. Today `node --test > f.log 2>&1; echo exit=$?` ends in `echo`, so the call succeeds whatever the suite did, and `true || node --test` credits a suite that never ran (hooks/flow-check.ts:68-81, 98-104; hooks/flow.ts:297-303). Rule: a check followed by `;` or `||` (or a pipe) counts as a pass only when the command ends in the status echo (`; echo <word>=$?` or `; echo $?`) and the output shows that status as 0; a failing status marks the kind open; any other trailing or preceding `||` branch is not credited. Plain redirection (`> f.log 2>&1`) keeps the status and is fine. Check: a passing and a failing suite through the recording hook (the flow tool-result path) and through `commitBlock`: failing → kind open and the commit denied; passing → recorded.
- [x] The incident cause is stated as confirmed-unrecognised, not as the only possible cause: a test that follows one fingerprint through `checked()` shows an unchanged print stays passing and a changed one (including a log file written inside the repository) does not. Check: flow-evidence.test.ts.

Slice 2 (what the hold says):

- [ ] When the generic fallback "a passing check on this code" would be printed (no required and no open kind) and no Bash command seen this task was recognised as a check, the hold text (`holdText`, `reminderText`, `openLine`, `commitBlock`) says no command was recognised as a check, names the recognised runner families in one short line and tells the model to run the project's test command or ask the user to add `Test:` to `AGENTS.md § Commands`. Check, four separate tests on the pure text functions: no shell call at all; only unrecognised calls and no required kind; a recognised failing check; a stale pass (print changed). Only the fourth and third keep the old wording. Files: flow-evidence.test.ts, commit-gate-policy.test.ts.

Slice 3 (delegate):

- [ ] `mcp__kit__delegate` on a read-only run no longer prints `Changed: <files>` from the working tree: it prints `Changed: nothing (read-only run)` and, when the tree differs, a separate `Changed meanwhile, not by this run: <files>`. Both routes: GPT (`r.sandbox`, delegate.ts:197) and Gemini (`writes`, delegate.ts:321, delegate-run.ts:179-182, 240-243). Check: delegate.test.ts, delegate-gemini.test.ts, delegate-reliability.test.ts.

Separate tasks (investigations, no code unless cheap and safe; results go under Handoff of their own spec):

- [ ] Temp directory for review runs: can a review-role run (`read-only`, delegate-policy.ts:190) get a writable temp directory so reviewers can run tests that create temp folders (Astra stopped at `mkdtemp` EPERM on 2026-11-19)? Test with the real Codex CLI: read-only plus a writable `TMPDIR`/root outside the repository, repository still unwritable. If impossible: one line in the review footer ("say which tests could not run and why").
- [ ] Classifier: why a plain question got `kit task: D2 E0 V0` and the delegate nudge. Read hooks/flow-prompt.ts and task-policy.ts; say whether a question with no change verb can skip the execute note and what a false negative costs.
- [ ] Declared commands (design only, not built here): letting `AGENTS.md § Commands` make an unrecognised command count as a check lets the model certify itself (`Test: true`, written by /setup or by the model, Markdown is outside the fingerprint, hooks/flow-required.ts:89-98, skills/setup/SKILL.md:65). Before any build the design must say who approves the command, pin the approved text, match the exact executable, arguments and directory (no word-boundary prefix: `./scripts/test.sh-old` must not match), require reliable status (no pipe), key the baseline by command identity as well as kind (flow-kinds.ts:34-68), and cover the Bash and the argv path (hooks/task-runner.ts:128).

- [ ] `claude plugin test .`, `claude plugin validate .`, push-guard, codex-hooks, shellcheck pass after each slice; AGENTS.md layout line for flow names the masked-status rule.

## Out of scope

- Changing what counts as verified (kinds, baseline logic, review families, V levels); only recognition, status handling and wording.
- Re-running checks at commit time (commit-gate.md decided against it).
- A "mark this check as passed" command: it lets a model claim evidence.
- Codex-side behaviour of the flow (the mod does not run there).

## Approach

1. Slice 1, tests first: add `nodes+(?:(?:--(?!eval|print|test)[w-]+(?:[= ]S+)?|-rs+S+)s+)*--test(?=s|$)` to the `test` runners (flags with an operand are listed explicitly: `--import`, `--require`/`-r`, `--experimental-*` take none or one), and reject `-e`/`-p`; then the masked-status rule in `checkOf`/`checkPassed` and its recording call in flow.ts. Ship this slice alone.
2. Slice 2: a pure `noCheckSeen(task)` fed by a counter of Bash commands seen that were not checks; the generic fallback stays when a check was seen but is stale.
3. Slice 3: delegate wording, both routes.
4. Investigations: separate throwaway sessions.

Each slice has its own checks and verifier; nothing is pushed without the user.

## Handoff

Plan only. Reviewed by Astra 2026-11-19 (3 P1: masked exit status via `; echo exit=$?`, self-certifying declared commands, baseline per kind not per command; regex boundary consumed twice; cause stated too strongly; slicing order), all adopted above. Origin: the angular-port-kit session of 2026-11-19 (a commit held four times with a green suite, verifier pass and other-family review); `checkOf` run on the actual commands to confirm. Not done: any code, the Codex temp-dir test, the classifier read.

## Verify

Not yet.
