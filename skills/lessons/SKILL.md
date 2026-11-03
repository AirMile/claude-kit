---
name: lessons
description: Knowledge checkpoint: record a project lesson, decision or correction in the right file. Use before a commit, after a surprising bug, a repeated correction, a build/fix run that taught something, or when the user says "remember this".
user-invocable: false
---

# Lessons

Persist what a future session needs, in the file Claude Code already loads at the right moment.
No separate memory store, no conversation archive.

## When it runs

- Called by `build` (Small and Finish), the fix path, `convert` and `commit` (step 1b).
- The user says "remember this" (or "onthoud dit") → run it now, don't wait for a checkpoint. A
  personal preference is not a project fact: say it doesn't belong in the project.
- A chat that never reaches a checkpoint or a memory request is not captured. That is accepted.

## What qualifies

Write a note only when **all** hold:

1. Current code and config do **not adequately convey** it: a session that reads only the
   relevant files would get it wrong. No file lists, architecture summaries, "X lives in Y". A
   rule whose reason is also in git history still qualifies: write the rule, point to the reason.
2. It would **change what the next session does**: a pitfall, a non-obvious convention, a
   constraint with its reason, a command that must be run a certain way.
3. It was **observed**: in this session (a bug, a failed attempt, a user correction), or it is
   already recorded in the spec's Handoff or Fixes, or in a file being migrated. Not guessed: an
   idea is not a decision, an unrun test is not a result, an assistant claim nobody checked is not
   a fact.

Nothing qualifies → write nothing and say nothing. Zero notes is the normal outcome.

## Where it goes

| It is…                                             | Destination                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A rule about one module/directory                  | `<that dir>/AGENTS.md` (create it if missing)                                                     |
| A project-wide rule (build, test, deploy, tooling) | root `AGENTS.md`, `## Pitfalls` or `## Conventions`                                               |
| An agreed decision with a rejected alternative     | `docs/decisions.md`; a decision replacing an older one also sets the old entry's `Superseded by:` |
| Why this change exists                             | the commit body (`commit` writes it)                                                              |
| Task state, a correction, the next step            | the spec's `## Handoff`; a bug's cause and fix: `## Fixes`                                        |
| An idea nobody agreed                              | `docs/roadmap.md` `## Later`, not a rule                                                          |
| Friction in a kit skill                            | the feedback inbox (see Skill Feedback), not the project                                          |

`docs/decisions.md` missing → create it with the header from `${CLAUDE_PLUGIN_ROOT}/skills/setup/SKILL.md` § docs/ format headers. An AGENTS rule may
point to the decision that holds the long reason; never to the hash of the commit being made.

## How to write it

- **Candidate first**: one line plus its destination. No candidate → stop, read nothing.
- Then read the destination. An existing line on the same topic gets updated, or replaced when it
  was wrong, never duplicated. A newer observed rule that contradicts an older one replaces it;
  ask only when both could still be true.
- 1-3 lines, imperative, with the reason. Example:
  `- Run migrations with pnpm db:push, not prisma migrate: the host has no shadow DB.`
- **Prune while there**: delete lines that are now false or fully conveyed by code and config.
  A line whose only support is git history stays. Root `AGENTS.md` stays ≤ 100 lines, nested
  ≤ 40: over the limit → merge or drop a line in the same edit.
- New nested file → start it with one heading line: `# <dir> notes`.

## Report

One line per written note: `lesson → <path>: <the line>`. Nothing written → no output.
