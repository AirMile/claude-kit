# <project name>

<one sentence: what it is and for whom>

## Commands

- Dev: `<cmd>` → http://localhost:<port>
- Test: `<cmd>` (single file: `<cmd> <path>`)
- Lint / typecheck: `<cmd>`
- Build: `<cmd>`
- Security: `<cmd>` (dependency audit, secrets; omit when none)
- Quality: `<cmd>` (dead code, duplication; omit when none)
- Protected: `<globs>` (lint, type and test config, CI files, test helpers: what defines green; the user locks them with /guard on; omit when none)

## Conventions

- <only what differs from the stack's defaults>

## Pitfalls

- <non-obvious traps, each with its reason>

## Git

- Workflow: <branches | trunk>
- Land: <pr | merge> (finished work: push the branch + open a PR, or merge into the default
  branch and push it; trunk pushes the default branch)
- Fresh worktree: `<install cmd>` before anything else
- Dev server: only use one this session started. Default port taken → a free one via `PORT`,
  and point the app's own URL variables (e.g. `NEXT_PUBLIC_SERVER_URL`) at it too. A second
  server refused (Next 16+: one `dev` per folder) → check the running one read-only, or run
  `build` and `start` on a free port (rebuild after each fix); say which.
- Database: worktrees share the local one → <own `DATABASE_URL` per worktree | schema push off
  outside the main checkout>; migrations only from the main checkout.
- Merge conflicts in docs/decisions.md or AGENTS.md: keep compatible additions of both sides,
  drop duplicates and superseded lines, never leave two contradicting rules.

## Backlog

- The backlog is <where: Todoist project `<name>` | tracker>. Do not keep a list in the repo.
- Add items only after the user confirms; complete one only after the user confirms.
- <only with a notes vault> Notes for the user: the Obsidian folder `<~/vault/Projects/Name>`
  (its `docs` links to this repo's `docs/`).

## Docs

- Product intent: `docs/product.md` · specs: `docs/specs/`
- Decisions and why: `docs/decisions.md`
