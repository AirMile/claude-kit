<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# commit-gate

Status: done
Design: —

## Goal

Phase 2c. A `git commit` is a hard moment: the Stop gate only holds a turn twice and then lets
unverified work through, so unverified code can still be committed. The commit gate denies a
`git commit` while the flow's open medium or heavy task is not verified on the current code (the
same evidence the Stop gate uses: required kinds per print, baseline, verifier, review). It
reuses that evidence instead of running the project's commands again (angular-port-kit's
check-before-commit re-runs `npm run check`, up to 240 s per commit).

## Acceptance criteria

- [x] `isCommit(command)` recognises `git commit`, `git -C dir commit`, `git -c k=v commit`,
      inside `a && git commit -m x`, and not `git log`, `echo "git commit"` text without a command
      position, `git commit-tree`, or `git commit --dry-run`.
- [x] A Bash `git commit` is denied when the open task is medium or heavy, changed on the current
      code and not verified, and the user has not waived it; the message names what is missing and
      says the user can say "skip verify" or run `/commitgate off`.
- [x] Allowed: no task, a light task, a verified task, a task the user waived (`stopAsked`),
      a review the flow marks as having no reviewer for this round; and any command that is not a commit.
- [x] `/commitgate on|off|status` per project root in `$.store` (default on); off allows everything.
- [x] `claude plugin test .`, `claude plugin validate .`, push-guard, codex-hooks, shellcheck pass.

## Out of scope

- Re-running the project's commands at commit time (evidence only); Codex (the mod does not run
  there); commits made outside this chat's Bash tool.

## Approach

- hooks/commit-gate-policy.ts (pure) + test: isCommit, commitBlock(task, print).
- hooks/commit-gate.ts: tool.call hook on Bash/PowerShell, `/commitgate` command; register.tsx.

## Handoff

Phase 2c. Deviates from the plan (re-run commands): evidence is free and already per kind.

## Verify

kit:verifier PASS on all criteria (334 mod tests, validate, push-guard 20, codex-hooks 10, shellcheck 24).
Gemini Flash review pass after three rounds (isCommit: quotes, heredocs, wrappers, per-commit --dry-run, separators).
Known: `npm test && git commit` is denied (evidence does not exist yet); an unverified task holds every commit until verified, waived or /commitgate off.
