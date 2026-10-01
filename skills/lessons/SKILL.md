---
name: lessons
description: Record a non-obvious project lesson in the nearest AGENTS.md. Use after a surprising bug, a repeated correction, or a build/fix run that taught something.
user-invocable: false
---

# Lessons

Persist what a future session could not learn from the code itself, in the instruction file that
Claude Code already loads at the right moment. No separate memory store.

## What qualifies

Write a lesson only when **all** hold:

1. It is **not derivable** from the code, config or git history (no file lists, no architecture
   summaries, no "X lives in Y" that a grep answers).
2. It would **change what the next session does**: a pitfall, a non-obvious convention, a
   constraint with its reason, a command that must be run a certain way.
3. It was **observed** this session (a bug, a failed attempt, a user correction), not guessed.

Nothing qualifies → write nothing and say nothing. Zero lessons is the normal outcome.

## Where it goes

- The pitfall is about one module/directory → `<that dir>/AGENTS.md` (create it if missing).
  It loads lazily, only when a session reads files there.
- It applies project-wide (build, test, deploy, tooling) → root `AGENTS.md`, section `## Pitfalls`
  or `## Conventions`.
- It is a decision with a rejected alternative → not a lesson; `docs/decisions.md` instead.

## How to write it

- 1-3 lines, imperative, with the reason. Example:
  `- Run migrations with pnpm db:push, not prisma migrate: the host has no shadow DB.`
- **Merge before adding**: read the target file first. An existing line on the same topic gets
  updated (or replaced when it was wrong), never duplicated.
- **Prune while there**: delete lines that are now false or derivable. Root `AGENTS.md` stays
  ≤ 100 lines; nested files ≤ 40.
- New nested file → start it with one heading line: `# <dir> notes`.

## Report

One line per written lesson: `lesson → <path>: <the line>`. Nothing written → no output.
