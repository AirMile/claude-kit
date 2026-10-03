---
name: commit
description: Stage safely and write a conventional commit message, optionally push. Use with /commit.
argument-hint: "[extra context | feature=<slug>]"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/staging-check.js)
---

# Commit

Turns the working tree into one or more clean commits. Called by the user, or by `build` with
`feature=<slug>`.

## 1. Pre-flight

One Bash call: `git status --porcelain`, `git diff --stat`, `git diff --cached --stat`, and
`git rev-parse --git-path rebase-merge --git-path rebase-apply --git-path MERGE_HEAD --git-path
CHERRY_PICK_HEAD`, then `ls` those paths (in a worktree `.git` is a file, so never `ls .git/…`).

Stop with one line when: no changes · rebase/merge/cherry-pick in progress (say which, and how to
continue or abort).

Read the full diff only when the stat is under ~1500 changed lines; above that, work from the
stat plus targeted reads.

## 2. Staging safety (always, before staging anything)

Run `node ${CLAUDE_SKILL_DIR}/scripts/staging-check.js` (from anywhere in the repo). Exit 0 →
nothing to handle. Exit 1 → act on each line:

- `BLOCK <path>` (secret file) → never stage it; tell the user. Already in history (`git log -1
-- <path>` prints a commit) → also: rotate the secret and `git rm --cached` it.
- `WARN <path>` (large, binary, critical file deleted) → AskUserQuestion per group before
  staging those paths.
- `IGNORE <pattern>` (untracked files .gitignore should cover) → offer to add the patterns
  (Add all (Recommended) / Skip); added → stage `.gitignore` with this commit.

Also ask when the diff changes `.gitignore` so that tracked files become untracked (suggest a
separate `chore:` commit).

## 3. Branch and group

`AGENTS.md § Git` says `branches` (or nothing) and you are on the default branch → AskUserQuestion
first: New branch `<type>/<scope>` (Recommended) / Commit on <default>. New branch → `git switch
-c` before staging. Skip in `feature=<slug>` mode (`/build` already branched).

Group changed paths by concern (directory + kind of change). Don't read diffs for this.

- **1 group** → stage it.
- **2+ groups, no file in two groups** → AskUserQuestion: Split into N commits (Recommended) /
  One commit. Split = stage and commit group by group with whole files; afterwards
  `git status --porcelain` must be empty of the grouped files.
- **A file carries two concerns** → one commit; mention it in the body. Don't hand-split hunks.

`feature=<slug>` mode: one commit with the code, the spec and the roadmap line; skip the split
question.

Staging when the user invoked plainly and nothing is staged: stage the group(s) directly; the
user asked to commit. Something already staged → commit only what's staged, and say what was
left out.

## 4. Message

Detect the repo's convention once: count the last 20 subjects (`git log --pretty=%s -20`)
matching `^[a-z]+(\([a-z0-9-]+\))?!?: `. 13+ → Conventional Commits. Otherwise mirror the
dominant style you see (ticket prefix `ABC-123: `, `[TAG] `, or plain imperative).

Conventional format:

```
<type>(<scope>)!: <description>

<body: why, not what; optional>
```

- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- Scope: the module, or the slug in `feature=<slug>` mode.
- Header ≤ 72 chars, lowercase start, imperative, no period, no emoji. English always.
- Breaking change → `!` and a `BREAKING CHANGE:` footer.
- Branch name contains `ABC-123` → use it per the repo's style.

## 5. Confirm and commit

- User invoked `/commit` and didn't say "just commit" → show the message, AskUserQuestion:
  Commit (Recommended) / Edit / Cancel. Each commit of a split gets its own confirmation unless
  the user approved the whole list at once.
- `feature=<slug>` mode, or the user's request already said to commit → commit without asking.

```bash
git commit -m "$(cat <<'EOF'
<message>
EOF
)"
```

**Hook failure** → show the output; fix the cause and create a **new** commit (never amend after
a failed commit). Skipping hooks (`--no-verify`) only when the user chooses it.

Amend only when the user asks **and** the last commit is unpushed **and** it was made in this
session.

## 6. Push

`feature=<slug>` mode lands the finished work as the project chose; otherwise never push unless
the user asked for it in this request, or answers yes now.

- **`feature=<slug>` mode** → `Land:` in `AGENTS.md § Git`, without asking. Missing → one
  AskUserQuestion (Merge into <default> + push / Push + PR), then write `- Land: <merge | pr>`
  under `## Git` so the next run doesn't ask.
  - `merge`, feature branch: `git fetch`; merge `origin/<default>` into the branch (conflicts:
    roadmap/decisions/AGENTS.md keep both sides, lockfiles/generated take `<default>`'s side
    then reinstall/regenerate, others resolve or stop; it brought commits → install when a
    lockfile changed, run the suite again); `git push origin HEAD:<default>`. In the main checkout also
    `git switch <default>`, `git merge --ff-only <branch>`, `git branch -d <branch>`.
  - `merge`, default branch (trunk): push it.
  - `pr`: push the branch, then `gh pr create` with a title from the commit(s) and the spec's
    Goal and criteria as the body (a PR is open already → the push updates it). No `gh` → push
    only and say so.
- **Feature branch, plain `/commit`**: Push + open PR / Push only / Not now (`Land: pr` →
  recommend the PR, `merge` → Push only).
- **Default branch, plain `/commit`**: Not now / Push, no recommendation (the user decides). On a
  host that deploys from it, say first that this goes live; suggest `/launch`.

The push-guard hook blocks unconfirmed pushes; after the user confirms (or `Land:` lands it), run
`KIT_PUSH_OK=1 git push` (PowerShell: `$env:KIT_PUSH_OK=1; git push`; add `--set-upstream
origin <branch>` on a first push).
Rejected → sync with the default branch first; no remote → `merge` lands locally only (main
checkout), `pr` stops; say so.

## Report

```
COMMIT
<hash> <subject>        (one line per commit)
branch   <branch> · <ahead n of origin | no upstream>
pushed   <yes | no> · <merged into <default> | PR <url> | —>
left     <unstaged files, or —>
```
