---
name: setup
description: Set up or migrate a project for kit (AGENTS.md, docs/, scaffold). Use with /setup.
disable-model-invocation: true
argument-hint: "[nothing | idea for a new project]"
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/migrate-v1.js" *), Bash(node "${CLAUDE_SKILL_DIR}/scripts/detect-tools.js" *)
---

# Setup

Makes a project kit-ready: a root `AGENTS.md` and the `docs/` files the other skills read.
Idempotent: re-running only fills gaps and reports drift. Run it from the main checkout, not
from a worktree session (it writes files every worktree needs).

## 0. Detect the situation

Check, in one Bash call: `pwd`, `git rev-parse --is-inside-work-tree`, `AGENTS.md`, `CLAUDE.md`,
`.claude/CLAUDE.md`, `CLAUDE.local.md` (and symlinks), `docs/product.md`, `docs/roadmap.md`,
`.project/`, `git worktree list`, any source files / package manifest, `.gitignore`, and which
subfolders hold a `.git` or a manifest.

| Situation                                                            | Route                |
| -------------------------------------------------------------------- | -------------------- |
| No git, no manifest; cwd is `$HOME`, `/`, a projects or chat folder  | **N. New folder**    |
| No source files, no `docs/product.md`                                | **P. Product first** |
| No source files, `docs/product.md` exists                            | **A. Scaffold**      |
| `.project/`, no `docs/product.md`, no `docs/roadmap.md`              | **C. Migrate v1**    |
| Otherwise                                                            | **B. Onboard**       |

## N. New folder

1. Ask the project name (open question; the arg as idea hints a name). Path: `<cwd>/<kebab-name>`;
   cwd is `$HOME` or a chat folder (the desktop app's throwaway one, no project) →
   `~/Projects/<kebab-name>`, naming that path in the question (no `~/Projects` → ask where).
   Taken and not empty → ask another name.
2. `mkdir -p` it and `git init` there.
3. Move the session: `mcp__ccd_directory__change_directory` (desktop) moves it when this turn
   ends → tell the user to send `/setup` (plus the idea) there. Tool missing (CLI) → print
   `cd <path> && claude`, then `/setup`. Stop: never write project files outside the session.

## P. Product first

Empty folder: invoke the `kit:product` skill (Skill tool) with the arg as the idea. It interviews,
then writes `docs/product.md` and the backlog with `scaffold` first. Cancelled → stop.
Written → continue here with **A** (don't stop at its report).

## A. Scaffold (greenfield)

1. Read `docs/product.md` → **Stack**. Missing or vague → one AskUserQuestion with 2-3 concrete
   stack options (recommended first), then write the choice back into `docs/product.md`.
2. Not a git repo → `git init`.
3. Scaffold with the stack's official generator, non-interactive flags (look them up with
   context7; don't guess). It refuses a non-empty folder → generate into a temp dir and move
   the files in; never pass `--overwrite`/`--force`.
4. Add the test runner the stack expects if the generator didn't (one, not a menu).
5. Boot the dev server once to confirm it works; a native desktop app (no server or port) →
   start it and check its window exists. Stop only the process you started.
6. A `scaffold` backlog item → complete it after the user confirms. Continue with **B**.

## B. Onboard

1. Read the manifest(s), scripts, lint/format/test config, and `git log -15 --oneline`. Run
   `node "${CLAUDE_SKILL_DIR}/scripts/detect-tools.js" .` (read-only): its `Test`, `Lint / typecheck`,
   `Build`, `Security` and `Quality` lines are what the project evidently has; they fill
   `## Commands` and nothing is added that the output doesn't show. Existing lines stay; only
   missing keys are filled (a `Lint` or `Typecheck` line counts as `Lint / typecheck`). Several `##` blocks (a monorepo) → one line per key per folder.
2. Write `AGENTS.md` (≤ 100 lines) from `${CLAUDE_SKILL_DIR}/references/agents-template.md`,
   filling only what you verified. Unknown → omit the line, never a placeholder.
3. **No `CLAUDE.md`**: Claude Code reads `AGENTS.md` (root and nested) natively only when no
   `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists. Move their durable content
   into `AGENTS.md`, then delete them (show what moves first). A symlink between the two → one
   real `AGENTS.md`.
4. `docs/decisions.md` missing → create it with its format header (below); never overwrite.
   `.project/backlog.json` with open items the backlog lacks (not saved earlier) → offer **C** 3.
   `docs/specs/` is created by `/task-readiness`. **Backlog**: fill `AGENTS.md § Backlog` by
   `${CLAUDE_PLUGIN_ROOT}/skills/product/SKILL.md` § The backlog (also its `docs/roadmap.md` offer).
5. `.gitignore`: `AGENTS.md` and `docs/` must **not** be ignored; remove such lines (show them
   first). Add `.claude/worktrees/`.
6. **Less to read**: checked-in generated or vendored code (`vendor/`, `*.generated.*`, a
   committed `dist/`) → `permissions.deny` `Read(./**/<dir>/**/*)` in `.claude/settings.json`
   (gitignored paths are skipped already). Main language has an LSP plugin in
   `claude-plugins-official` (e.g. `typescript-lsp`) → suggest it in the report; don't install.
7. **Git** for `AGENTS.md § Git`, one AskUserQuestion with two questions. Workflow: Branches
   (Recommended for parallel sessions or a host that deploys the default branch) / Trunk (one
   session at a time, commits straight to the default branch). Land, how finished work goes in: Merge + push (Recommended solo) / Pull request (team, or CI to watch).
8. **Parallel sessions**: write `.worktreeinclude` with the gitignored files a fresh worktree
   needs: `.env*` that exist and files the development and build config loads (`git check-ignore`).
   `.claude/launch.json` exists → set `"autoPort": true` on the dev server (the desktop app then
   passes a free port as `PORT`). A local database → fill the database line in `AGENTS.md § Git`.
9. Report.

### docs/ format headers

`docs/decisions.md`:

```markdown
<!-- format: newest first. Only decisions where an alternative was really rejected.
## YYYY-MM-DD · <decision>
Why: <reason> · Rejected: <alternative + why not> · Superseded by: <link or —> -->

# Decisions
```

## C. Migrate v1

First run `node "${CLAUDE_SKILL_DIR}/scripts/migrate-v1.js" .` (read-only): it prints the open
backlog items, the product source, learnings grouped by target `AGENTS.md`, and a
CLAUDE.md summary. Work from that output instead of reading the JSON yourself.

1. **CLAUDE.md** → keep only content that is not derivable and not template (project rules,
   runbooks, pitfalls) for `AGENTS.md`. Drop `## User Preferences`, `## Project`, `## Project
Context`, the GENERATED marker, `{{…}}` placeholders, `.project/` rules, Frontend Edit Rules.
2. **Product** → `.project/project-seed.md` → `docs/product.md`, condensed to the product format
   (see `product` skill: What · For whom · Why · Non-goals · Stack).
3. **Backlog** → the script's items go to the backlog of **B** step 4. Drop v1-only items
   (re-running v1 manual tests, `.project`/worktree tooling).
4. **Learnings** → at most ~15 that pass the `lessons` criteria, in the `AGENTS.md` the script
   grouped them under. Drop v1-pipeline ones; merge duplicates (often stored twice, two languages).
5. **Old worktrees** (`git worktree list` beyond the main checkout, v1 made them): per worktree
   show branch, uncommitted files, commits not on the default branch, last commit date. Ask per
   worktree: Keep / Remove (only offered when it has nothing unmerged or uncommitted that matters).
6. Then run **B** steps 2-9 with this material. Leave `.project/` untouched; tell the user it
   can be deleted once they are happy.

Show the proposed `AGENTS.md` and backlog items as a preview and get one confirmation before writing
(AskUserQuestion: Write (Recommended) / Adjust / Cancel).

## Report

```
SETUP · <route>
AGENTS.md     <created | updated | unchanged> (<n> lines) · CLAUDE.md <removed | none>
docs/         <files created>
migrated      <n backlog items, n lessons, worktrees kept/removed> (v1 only)
git           <branches | trunk> · .worktreeinclude <files | —>
context       deny <paths | —> · lsp <plugin to install | —>
desktop       Settings → Claude Code: branch prefix (+ auto-archive after PR merge with Land: pr)
next          /product (no product.md) · /task-readiness <item> (backlog ready)
```

Do not commit; offer `/commit`.
