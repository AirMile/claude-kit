---
name: launch
description: Take finished work live safely: checks, release notes, merge or version tag. Use with /launch.
argument-hint: "[nothing | patch | minor | major]"
---

# Launch

The step from "done on my branch" to "live". It checks what is about to go out, says the risk in
plain language, and only then merges, pushes or tags, with the user's OK.

## 0. Detect

One Bash call: current + default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`),
`git status --porcelain`, `git fetch`, tags (`git tag --sort=-creatordate | head -5`), and which
of these exist: `vercel.json`, `.vercel/`, `netlify.toml`, `fly.toml`, `render.yaml`,
`CHANGELOG.md`, `release-please-config.json`, `.github/workflows/*release*`.

**Release model** (both can apply):

| Model      | Signals                                                                           | Going live means               |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------ |
| Continuous | a host config above, or `AGENTS.md` says the default branch deploys               | merge to the default branch    |
| Versioned  | `v*` tags, a `CHANGELOG.md`, or a publishable package (`version` + not `private`) | version bump + changelog + tag |

`release-please` (or another release bot) present → it owns versions and changelogs: do the
checks and the merge only.

**Range** = what goes live: on a feature branch `origin/<default>..HEAD`; on the default branch
`origin/<default>..HEAD` (unpushed) or, versioned, `<last tag>..HEAD`. Empty → nothing to
launch; stop.

Stop first when: uncommitted changes (offer `/commit`) · branch behind the default branch (sync
it first: in a desktop worktree session use the app's sync; otherwise merge the default branch)
· no `origin` remote (offer `gh repo create --private --source . --push`, only on an explicit
yes). Sync conflicts: lockfiles and generated files → take one side, then reinstall/regenerate;
source files → typecheck each right after resolving; full suite green before the merge commit.

## 1. Checks

From `AGENTS.md § Commands`: install if needed, then build, tests, typecheck/lint. Any failure →
stop and report; nothing goes live red. A dev server this session runs in this folder → stop it
before `build` (Next.js ≤ 15 shares the output dir: the dev page silently stops hydrating).

Then scan the range (`git diff --stat` + targeted reads):

- **Database migrations** (new files under `migrations/`, `prisma/migrations/`,
  `supabase/migrations/`, drizzle, Payload): does the deploy run them (build command in
  `vercel.json` / `package.json`)? If not → they must run before or right after; say exactly how.
- **Environment variables**: new `process.env.X` / `import.meta.env.X` names in the range that are
  missing from `.env.example` → must be set on the host first.
- **Host or runtime config** changed (`vercel.json`, `next.config.*`, middleware, headers,
  redirects) → call it out.
- **Dependencies**: lockfile changed → list new packages and major-version bumps, and run
  `npm audit --omit=dev --audit-level=high` (or `osv-scanner scan source -r .` when installed).
  Only vulnerabilities in packages this range added or bumped raise the risk.
- **Sensitive areas** (auth, payments, user input stored server-side) → recommend
  `/security-review` before going live.

## 2. Release notes

Group the range's commits by type (conventional commits): **New**, **Fixed**, **Other**
(skip `chore`/`ci`/`test` unless user-visible). Rewrite each as one user-facing line; link the
spec slug when a commit belongs to one. Language: that of the existing `CHANGELOG.md`/releases,
else the user's.

Versioned → next version from the range: any `!`/`BREAKING CHANGE` → major, else any `feat` →
minor, else patch. An argument (`patch|minor|major`) overrides; say when it disagrees.

## 3. Go / no-go

Show one block:

```
LAUNCH · <continuous | versioned vX.Y.Z> · <n> commits
risk       <low | medium | high>: <reasons>
before     <migrations to run, env vars to set, or —>
rollback   <previous tag / commit; on Vercel: promote the previous deployment>
notes      <release notes>
```

AskUserQuestion: Go live (Recommended only when risk is low) / Not now. High risk → also list
what would lower it.

## 4. Go live

In order, stopping on the first failure:

1. **Versioned**: bump `version` in the manifest, prepend the notes to `CHANGELOG.md`
   (`## [X.Y.Z] - YYYY-MM-DD`), commit `chore(release): vX.Y.Z`.
2. **Merge**. The user said Go live, so pushes use `KIT_PUSH_OK=1 git push` (PowerShell:
   `$env:KIT_PUSH_OK=1; git push`).
   - Feature branch, `Land: pr` (`AGENTS.md § Git`) + `gh`: push the branch, PR (existing or
     `gh pr create`), then `gh pr merge --squash --delete-branch`.
   - Feature branch, `Land: merge` or no `gh`: synced in step 0, so push it as the default
     branch (`git push origin HEAD:<default>`); in the main checkout also fast-forward the
     local one (`git switch <default>`, then `git merge --ff-only <branch>`).
   - Already on the default branch: push it.
3. **Tag** the merged result, not your branch tip: `git fetch`, then tag `origin/<default>`.
   Versioned → `vX.Y.Z`; continuous → `release-YYYY-MM-DD` (`.2`, `.3` on the same day) as a
   rollback anchor. Push the tag; versioned + `gh` → `gh release create` with the notes.
4. Never `npm publish` (or another registry publish) without a separate explicit OK.

## 5. After

Production URL known (`AGENTS.md`) → check it answers 200 once the host reports the deploy (`gh
pr checks` / the host's status), and look at the console of the home page. Problems → show the
rollback line again.
The range touched an `AGENTS.md`, `.claude/rules/` or a skill → suggest `/doctor prompt-audit`
(stale or contradicting instructions) in the report.

## 6. Clean up (no orphan worktrees)

- The merged branch: delete it locally when no worktree has it checked out (`git branch -d`).
- This session runs in a desktop worktree → merged through a PR with the app's _Auto-archive
  after PR merge or close_ on, the app archives it; otherwise offer to archive it.
- Other worktrees (`git worktree list`) whose branch is now merged into `origin/<default>` and
  have no uncommitted changes → list them and offer to archive those sessions (the desktop app
  asks you per session) or, for worktrees the app doesn't know, `git worktree remove`.

## Report

```
LAUNCH · <version or release tag>
live       <merged / pushed commit> · <url status or —>
notes      <n> lines · CHANGELOG <updated | —>
todo       <migrations / env vars still to do, or —>
cleanup    <branches deleted · sessions archived · or —>
suggest    </doctor prompt-audit, or —>
```
