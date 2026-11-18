<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# checker-guard

Status: done
Design: —

## Goal

Phase 2b of the rebuild. The files that define "green" (lint and type config, test config, CI,
test helpers) must not be loosened by the agent that wants green. A project lists them in
`AGENTS.md § Commands` (`Protected:`); the user locks them with `/guard on`; while locked,
the mod denies edits to them, also from subagents. Lifted from angular-port-kit's
guard-checker-files, as a mod hook with the lock in `$.store` (the agent cannot write it).

## Acceptance criteria

- [x] `parseProtected` reads a `Protected:` line under `## Commands` (comma or space separated,
      backticks allowed); none or `—` → no globs. Globs: `*` (no slash), `**`, `?`; a glob without a
      slash matches that name in any folder; case-insensitive; backslashes normalised.
- [x] Locked and a path matches: Edit, Write, MultiEdit and NotebookEdit are denied with a message
      that says to stop, report which change is needed and why, and that the user decides (`/guard off`).
- [x] Locked: a Bash or PowerShell command that writes (redirect, tee, sed -i, rm, mv, cp,
      Set-Content, git checkout/restore, …) to a matching path is denied; reading it (`cat`, `grep`,
      a read before the writer in the same segment) is allowed.
- [x] Not locked, or no `Protected:` globs: nothing is denied.
- [x] `/guard on` needs globs (otherwise says how to add them); `/guard off` and `/guard status`
      work; the lock is per project root in `$.store`, not a file the agent can write.
- [x] Subagent tool calls are guarded too: the hook has no caller filter (test); that the engine delivers subagent tool.call events is a manual check (spawn a subagent that edits a locked file).
- [x] `claude plugin test .`, `claude plugin validate .`, push-guard, codex-hooks, shellcheck pass.

## Out of scope

- Codex (the mod does not run there), hidden holdout folders, a weakened-check scan (2c).
- A shell check is a speed bump, not a sandbox: it catches the obvious ways to write a path.

## Approach

- hooks/guard-policy.ts (pure) + test: parseProtected, glob matching, shellWritesProtected.
- hooks/guard.ts: the tool.call hook, `/guard` command, $.store lock; registered in register.tsx.
- AGENTS.md: mod reads `Protected:` too; skills/setup agents-template mentions the line.

## Handoff

Phase 2b. Lock lives in the mod's $.store so the agent cannot unlock it; no lock file.

## Verify

kit:verifier PASS on all criteria (326 mod tests, validate, push-guard 20, codex-hooks 10, shellcheck 24).
Gemini Flash review pass after four rounds of fixes (path cleaning, lock snapshot, shell writers, cp tail).
Manual, open: that the engine delivers subagent tool.call events to the guard (lock a file, let a subagent edit it).
Known limits: `cp -t`, `rsync`, `ln -sf`, interpreters and symlinks are not caught (speed bump, not a sandbox).
