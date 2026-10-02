# <project name>

<one sentence: what it is and for whom>

## Commands

- Dev: `<cmd>` → http://localhost:<port>
- Test: `<cmd>` (single file: `<cmd> <path>`)
- Lint / typecheck: `<cmd>`
- Build: `<cmd>`

## Conventions

- <only what differs from the stack's defaults>

## Pitfalls

- <non-obvious traps, each with its reason>

## Git

- Workflow: <branches | trunk>
- Fresh worktree: `<install cmd>` before anything else
- Dev server: only use one this session started. Default port taken → a free one via `PORT`,
  and point the app's own URL variables (e.g. `NEXT_PUBLIC_SERVER_URL`) at it too.
- Database: worktrees share the local one → <own `DATABASE_URL` per worktree | schema push off
  outside the main checkout>; migrations only from the main checkout.
- Merge conflicts in docs/roadmap.md, docs/decisions.md or AGENTS.md: keep both sides' lines.

## Docs

- Product intent: `docs/product.md` · roadmap: `docs/roadmap.md` · specs: `docs/specs/`
- Decisions and why: `docs/decisions.md`
