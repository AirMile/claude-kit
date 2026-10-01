---
name: setup
description: Set up or migrate a project for kit (AGENTS.md, docs/, scaffold). Use with /setup.
argument-hint: "[nothing | scaffold]"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/migrate-v1.js *)
---

# Setup

Makes a project kit-ready: a root `AGENTS.md` and the `docs/` files the other skills read.
Idempotent: re-running only fills gaps and reports drift. Run it from the main checkout, not
from a worktree session (it writes files every worktree needs).

## 0. Detect the situation

Check, in one Bash call: `git rev-parse --is-inside-work-tree`, `AGENTS.md`, `CLAUDE.md`,
`.claude/CLAUDE.md`, `CLAUDE.local.md` (and symlinks), `docs/product.md`, `docs/roadmap.md`,
`.project/`, `git worktree list`, any source files / package manifest, `.gitignore`.

| Situation                                       | Route                                                       |
| ----------------------------------------------- | ----------------------------------------------------------- |
| No source files, no `docs/product.md`           | Stop: "Empty project: run `/roadmap` first, then `/setup`." |
| No source files, `docs/product.md` exists       | **A. Scaffold**                                             |
| `.project/` exists and no `docs/roadmap.md` yet | **C. Migrate v1**                                           |
| Otherwise                                       | **B. Onboard**                                              |

## A. Scaffold (greenfield)

1. Read `docs/product.md` → **Stack**. Missing or vague → one AskUserQuestion with 2-3 concrete
   stack options (recommended first), then write the choice back into `docs/product.md`.
2. Not a git repo → `git init`.
3. Scaffold with the stack's official generator, non-interactive flags (look them up with
   context7; don't guess). It refuses a non-empty folder → generate into a temp dir and move
   the files in; never pass `--overwrite`/`--force`.
4. Add the test runner the stack expects if the generator didn't (one, not a menu).
5. Boot the dev server once to confirm it works; stop only the process you started.
6. Mark the `scaffold` roadmap item `[x]`. Continue with **B**.

## B. Onboard

1. Read the manifest(s), scripts, lint/format/test config, and `git log -15 --oneline`.
2. Write `AGENTS.md` from the template below, filling only what you verified. Unknown → omit the
   line, never a placeholder.
3. **No `CLAUDE.md`**: Claude Code reads `AGENTS.md` (root and nested) natively only when no
   `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists. Move their durable content
   into `AGENTS.md`, then delete them (show what moves first). A symlink between the two → one
   real `AGENTS.md`.
4. `docs/`: create what is missing: `roadmap.md` and `decisions.md` with their format headers
   (below). Never overwrite existing content. `docs/specs/` is created by `/build` when needed.
5. `.gitignore`: `AGENTS.md` and `docs/` must **not** be ignored; remove such lines (show them
   first). Add `.claude/worktrees/`.
6. **Git mode** for `AGENTS.md § Git`: AskUserQuestion: Branches + PR (Recommended when the host
   deploys from the default branch, for team work, or for parallel sessions) / Trunk (solo, one
   session at a time, nothing deploys from the default branch).
7. **Parallel sessions**: write `.worktreeinclude` with the gitignored files a fresh worktree
   needs (`.env`, `.env.local`, … that exist). `.claude/launch.json` exists → set
   `"autoPort": true` on the dev server (the desktop app then picks a free port and passes it
   as `PORT`). A local database → fill the database line in `AGENTS.md § Git`.
8. Report.

### AGENTS.md template (≤ 100 lines)

```markdown
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
```

### docs/ format headers

`docs/roadmap.md`: the `roadmap` skill owns this format; copy its header and an empty
`# Roadmap` from `${CLAUDE_PLUGIN_ROOT}/skills/roadmap/SKILL.md § Formats` when /roadmap has not run.

`docs/decisions.md`:

```markdown
<!-- format: newest first. Only decisions where an alternative was really rejected.
## YYYY-MM-DD · <decision>
Why: <reason> · Rejected: <alternative + why not> · Superseded by: <link or —> -->

# Decisions
```

## C. Migrate v1

First run `node ${CLAUDE_SKILL_DIR}/scripts/migrate-v1.js .` (read-only): it prints the open
backlog as roadmap lines, the product source, learnings grouped by target `AGENTS.md`, and a
CLAUDE.md summary. Work from that output instead of reading the JSON yourself.

1. **CLAUDE.md** → keep only content that is not derivable and not template (project rules,
   runbooks, pitfalls) for `AGENTS.md`. Drop `## User Preferences`, `## Project`, `## Project
Context`, the GENERATED marker, `{{…}}` placeholders, `.project/` rules, Frontend Edit Rules.
2. **Product** → `.project/project-seed.md` → `docs/product.md`, condensed to the product format
   (see `roadmap` skill: What · For whom · Why · Non-goals · Stack).
3. **Backlog** → the script's roadmap lines → `docs/roadmap.md`. Drop v1-only items (re-running
   v1 manual tests, `.project`/worktree tooling).
4. **Learnings** → at most ~15 that pass the `lessons` criteria, in the `AGENTS.md` the script
   grouped them under. Drop v1-pipeline ones; merge duplicates (often stored twice, two languages).
5. **Old worktrees** (`git worktree list` beyond the main checkout, v1 made them): per worktree
   show branch, uncommitted files, commits not on the default branch, last commit date. Ask per
   worktree: Keep / Remove (only offered when it has nothing unmerged or uncommitted that matters).
6. Then run **B** steps 2-8 with this material. Leave `.project/` untouched; tell the user it
   can be deleted once they are happy.

Show the proposed `AGENTS.md` and roadmap as a preview and get one confirmation before writing
(AskUserQuestion: Write (Recommended) / Adjust / Cancel).

## Report

```
SETUP · <route>
AGENTS.md     <created | updated | unchanged> (<n> lines) · CLAUDE.md <removed | none>
docs/         <files created>
migrated      <n roadmap items, n lessons, worktrees kept/removed> (v1 only)
git           <branches | trunk> · .worktreeinclude <files | —>
desktop       Settings → Claude Code: branch prefix, auto-archive after PR merge
next          /roadmap (no roadmap) · /build (roadmap ready)
```

Do not commit; offer `/commit`.
