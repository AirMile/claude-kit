# kit

A small Claude Code plugin for building software with Claude. It covers the whole loop: shape an
idea, turn it into a roadmap, build features one at a time (spec → code → independent verify →
commit), fix bugs with discipline, and convert designs into code.

kit is the successor to `claude-config` v1. v1 grew to 42 skills, ~15k lines of shared
instructions and its own state engine (JSON state files, a backlog server, checkpoints, a sync
branch). Most of the friction came from that machinery, not from the actual work. kit keeps the
workflow and drops the machinery: all state is plain markdown in your repo, and wherever Claude
Code already has a native feature (plan mode, subagents, `AGENTS.md` loading, `/simplify`,
`/security-review`) kit uses it instead of rebuilding it.

```
11 skills · 1 agent · 2 hooks + 1 mod (2 panes) · 2 scripts · ~1100 lines of skills · ~330 tokens always-on
```

---

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Core idea: your repo is the state](#core-idea-your-repo-is-the-state)
- [Files kit maintains in your project](#files-kit-maintains-in-your-project)
- [Skills](#skills)
  - [/roadmap](#roadmap)
  - [/setup](#setup)
  - [/build](#build)
  - [/commit](#commit)
  - [/convert](#convert)
  - [/theme](#theme)
  - [/improve](#improve)
  - [/launch](#launch)
  - [/audit](#audit)
  - [/explain](#explain)
  - [lessons](#lessons-claude-only)
- [The verifier agent](#the-verifier-agent)
- [Hooks](#hooks)
- [Git, branches and parallel sessions](#git-branches-and-parallel-sessions)
- [Common flows, step by step](#common-flows-step-by-step)
- [What Claude loads, and when](#what-claude-loads-and-when)
- [Coming from claude-config v1](#coming-from-claude-config-v1)
- [Troubleshooting](#troubleshooting)
- [Evals](#evals)
- [Developing kit](#developing-kit)

---

## Install

This repo is both the plugin and its marketplace (`airmile`). It's private, so installing needs
a GitHub login that can read `AirMile/claude-kit`.

**Any machine (installs a copy from GitHub):**

```bash
claude plugin marketplace add AirMile/claude-kit
claude plugin install kit@airmile
```

Get updates later with `claude plugin marketplace update airmile`.

**The machine you develop kit on (runs straight from your clone):**

```bash
git clone https://github.com/AirMile/claude-kit ~/Projects/claude-kit
claude plugin marketplace add ~/Projects/claude-kit
claude plugin install kit@airmile
```

The install is a copy in `~/.claude/plugins/cache/airmile/kit/<version>/`: edits in the clone
take effect only after a version bump + update (see [Update](#update--uninstall)); `/commit`
pushes them to GitHub.

Check with `claude plugin details kit`: it should list 11 skills, 1 agent and 2 hooks. Skills
are available in **new** sessions; in a running session use `/reload-plugins`.

Skills are namespaced as `/kit:<skill>` (e.g. `/kit:build`). The bare name (`/build`) also works as
long as no other skill or command uses it.

### No CLAUDE.md in your projects

kit keeps project instructions in `AGENTS.md`, including nested ones per module. Claude Code
(v2.1.277+) reads root and nested `AGENTS.md` files natively, but **only when the project has no
`CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`** (docs: memory § AGENTS.md). So kit
projects have none: `/setup` moves anything useful from an existing `CLAUDE.md` into `AGENTS.md`
and removes it. Your personal `~/.claude/CLAUDE.md` doesn't count and keeps working.
Bonus: `AGENTS.md` is also read by other coding agents, so the project stays tool-agnostic.

### Recommended: frontend rule

Plugins can't ship rules, so kit keeps a path-scoped rule in `rules/frontend.md` (simplest CSS
first, use the project's tokens, check layout edits in the browser, edit pasted inspect refs in
place). It loads only when Claude reads frontend files. Link it once per machine:

```bash
mkdir -p ~/.claude/rules
ln -sfn ~/Projects/claude-kit/rules/frontend.md ~/.claude/rules/frontend.md
```

On Windows, copy the file instead (symlinks need admin rights there).

### Update / uninstall

- Edits to this repo take effect only after you bump `version` in `.claude-plugin/plugin.json`, then `claude plugin marketplace update airmile && claude plugin update kit@airmile` and start a new session. Without the bump the cached copy stays as it was.
- Try edits without installing: `claude --plugin-dir ~/Projects/claude-kit`.
- Remove: `claude plugin marketplace remove airmile` (also uninstalls the plugin).

---

## Quick start

**A brand-new idea**

```
/roadmap a habit tracker for people who quit after a week
/setup            → scaffolds the stack from docs/product.md, writes AGENTS.md
/build             → builds the first roadmap item
/build             → and the next one …
```

**An existing repo**

```
/setup            → reads the repo, writes AGENTS.md + docs/
/roadmap             → writes docs/product.md and the roadmap from a short interview
/build <slug>
```

**A quick change**: no skill needed. Ask for it in plain words (auto mode is fine), then:

```
/commit
```

`AGENTS.md` and the frontend rule load in every chat, so a plain request still follows the
project's conventions. Use `/build` once it's a real feature or a bug whose cause isn't obvious:
that's where the spec, the independent verify and resuming in a new chat pay for themselves.

**A bug**

```
/build "fix: saving a habit twice creates a duplicate"
```

**Going live**

```
/launch
```

**A design**

```
/convert ~/Desktop/pricing.png app/pricing/page.tsx
```

---

## Core idea: your repo is the state

kit has no database, no JSON state, no background server and no checkpoint files. Everything a
skill needs to know lives in a handful of markdown files **committed to your repo**:

- They sync between your machines through git, like the rest of your code.
- A new chat can pick up any interrupted work by reading them (`/build <slug>` resumes from the
  spec's `Status:` line and its checkboxes).
- You can read and edit them by hand. Each file starts with a `<!-- format: … -->` header that
  describes its own format, so skills (and you) never need a separate schema document.

Two rules keep them small:

1. **Only write down what can't be derived from the code.** Architecture summaries and file
   lists go stale; Claude can always re-read the code. Decisions, intent, pitfalls and
   conventions can't be re-derived, so those are what kit records.
2. **Every file has one owner skill** that knows its format (listed below).

---

## Files kit maintains in your project

```
your-project/
├── AGENTS.md              instructions: commands, conventions, pitfalls (≤100 lines)
├── .worktreeinclude       gitignored files (.env …) copied into new worktree sessions
├── src/payments/AGENTS.md module-specific pitfalls, loaded only when Claude works there
└── docs/
    ├── product.md            what, for whom, why, non-goals, stack
    ├── roadmap.md         ordered features = the backlog
    ├── decisions.md       decisions + the alternative that was rejected
    └── specs/
        └── <slug>.md      one per feature: criteria, status, verify result, later fixes
```

| File                   | Written by          | Read by                       | Loaded into context                          |
| ---------------------- | ------------------- | ----------------------------- | -------------------------------------------- |
| `AGENTS.md` (root)     | `/setup`, `lessons` | every session                 | always, at session start                     |
| `<dir>/AGENTS.md`      | `lessons`           | every session                 | lazily, when Claude reads a file in that dir |
| `docs/product.md`         | `/roadmap`             | `/build`, `/convert`, `/setup` | on demand                                    |
| `docs/roadmap.md`      | `/roadmap`, `/build`    | `/build`                       | on demand                                    |
| `docs/specs/<slug>.md` | `/build`             | `/build`, verifier             | on demand                                    |
| `docs/decisions.md`    | `/build`, `/setup`   | `/build`                       | on demand                                    |

### AGENTS.md

The one instruction file Claude Code reads every session. `AGENTS.md` is also understood by
other coding agents (Codex, Cursor, …), so your project stays tool-agnostic. Template:

```markdown
# my-app

Habit tracker PWA for people who drop habits after a week.

## Commands

- Dev: `pnpm dev` → http://localhost:5173
- Test: `pnpm test` (single file: `pnpm test src/habits.test.ts`)
- Lint / typecheck: `pnpm lint && pnpm typecheck`
- Build: `pnpm build`

## Conventions

- Dates are stored as ISO strings in UTC; convert only in the view layer.

## Pitfalls

- Service worker caches /api in dev too: hard-reload after changing API responses.

## Git

- Workflow: branches
- Fresh worktree: `pnpm install` before anything else

## Docs

- Product intent: `docs/product.md` · roadmap: `docs/roadmap.md` · specs: `docs/specs/`
- Decisions and why: `docs/decisions.md`
```

The **Commands** section matters: `/build` and the verifier use the dev command and port from it
to run browser checks.

Nested `AGENTS.md` files hold pitfalls that only matter in one module. Because they load only
when Claude touches that directory, they cost nothing the rest of the time.

### docs/product.md

Product intent, under ~60 lines. Sections: **What**, **For whom**, **Why now**, **Core
experience**, **Non-goals**, **Stack**, **Open questions**. `/build` reads the non-goals before
defining a feature, so scope creep is caught early.

### docs/roadmap.md

The backlog. One line per item, order = priority:

```markdown
# Roadmap

- [x] **scaffold** · project skeleton, dev server, test runner · spec: docs/specs/scaffold.md
- [ ] **habit-crud** · create, edit, delete habits · spec: docs/specs/habit-crud.md
- [ ] **streaks** · show current and best streak per habit
- [ ] **reminders** · daily push reminder at a chosen time

## Later

- sharing streaks with a friend
```

The three states are encoded in the line itself:

| Line                                                      | Meaning                       |
| --------------------------------------------------------- | ----------------------------- |
| `- [ ] **slug** · description`                            | open, not started             |
| `- [ ] **slug** · description · spec: docs/specs/slug.md` | **in progress** (spec exists) |
| `- [x] **slug** · description · spec: …`                  | done                          |

`## Later` holds unordered ideas that are not in the flow yet.

### docs/specs/\<slug\>.md

Created by `/build` when you approve a feature plan. It is both the contract and the resume point:

```markdown
# habit-crud

Status: building
Design: —

## Goal

Users can create, rename and delete habits; the list survives a reload.

## Acceptance criteria

- [x] Happy: adding "Read 10 pages" shows it at the top of the list
- [ ] Edge: an empty or whitespace-only name is rejected with an inline message
- [ ] Error: when storage is full, the user sees "Couldn't save" and the form keeps its input

## Out of scope

- Reordering habits

## Approach

- src/habits/store.ts (new): load/save to IndexedDB
- src/habits/HabitForm.tsx (new) …

## Tests

- src/habits/store.test.ts → happy, error
- browser: empty-name message visible

## Handoff

- Store keeps names trimmed; the form shows the raw input (user asked for that)

## Verify

<auto result, manual items and their outcome>

## Fixes

<later bugfixes: date · symptom · cause · fix>
```

`Status` moves `defined → building → verifying → manual → done`. A criterion is checked only
when it is built **and** verified.

### docs/decisions.md

Newest first; one block per decision where an alternative was genuinely rejected:

```markdown
## 2026-10-01 · Store habits in IndexedDB, not localStorage

Why: needs >5 MB for history · Rejected: localStorage (size cap, sync API blocks UI) · Superseded by: —
```

This is the part of "architecture" that can't be re-derived from the code: _why_ it is the way
it is.

---

## Skills

### /roadmap

Turn an idea into `docs/product.md` + `docs/roadmap.md`, or update them later.

```
/roadmap <idea>          new project (when docs/product.md doesn't exist)
/roadmap add <item>      update: add, reorder, remove or reword roadmap items
/roadmap critique        stress-test product.md and the roadmap without changing it
```

**New**

1. Takes your idea (or asks one open question).
2. Enters **plan mode**: the draft product.md and roadmap are what you approve.
3. Runs 1–3 rounds of clickable questions (audience, MVP size, core experience, stack, then
   gaps). Vision and naming are asked as open questions; visual choices are shown as small
   mocks; competing designs get a trade-off table first.
4. Shows both files in the plan, and the draft roadmap in the [roadmap pane](#kit-mod).
   **Accept** writes them; **reject** revises.

Roadmap rules: every item is a user-visible capability buildable in one `/build` run (≤ ~6
acceptance criteria, otherwise split); dependencies first, then value; greenfield projects start
with a `scaffold` item; 5–15 items for an MVP, the rest under `## Later`.

**Update** finds the right position for a new item, checks it against the product's non-goals
(conflict → asks whether the non-goal changes or the item is dropped), never touches done or
in-progress items, and shows a diff before writing.

**Critique** applies three lenses (max 3 findings each): the least-proven assumption, how the MVP
disappoints its first real user, and the smallest roadmap that still tests the core idea. It then
offers to apply the changes through Update.

### /setup

Make a project kit-ready. Idempotent: running it again only fills gaps.

It detects one of four situations:

| Situation                                             | What happens                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Empty folder, no docs/product.md                                | Stops: run `/roadmap` first                                                                                        |
| Empty folder, `docs/product.md` exists                   | **Scaffold**: runs the stack's official generator, adds a test runner, boots the dev server once, then onboards |
| A v1 project (`.project/`, no `docs/roadmap.md` yet) | **Migrate** (below)                                                                                             |
| Any other existing code                               | **Onboard**                                                                                                     |

**Onboard** reads the manifest, scripts, test/lint config and recent git history, then:

- writes `AGENTS.md` from the template, with only verified facts (no placeholders);
- moves useful content from an existing `CLAUDE.md` into `AGENTS.md` and removes the `CLAUDE.md`
  (otherwise `AGENTS.md` wouldn't load);
- creates `docs/roadmap.md` and `docs/decisions.md` with their format headers (never overwrites);
- makes sure `AGENTS.md` and `docs/` are not in `.gitignore`, and ignores `.claude/worktrees/`;
- asks the git mode and prepares parallel sessions (`.worktreeinclude`, `autoPort`, database line).

**Migrate (v1 → kit)** moves the durable parts of v1's state and leaves `.project/` untouched so
you can delete it when satisfied:

| v1 source                                        | kit destination                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Generated `CLAUDE.md`                            | real rules/runbooks/pitfalls → `AGENTS.md`; template sections dropped |
| `AGENTS.md` symlinked to `CLAUDE.md`             | replaced by a real file                                               |
| `.project/project-seed.md`                       | `docs/product.md`                                                        |
| `.project/backlog.json` (unshipped, board order) | `docs/roadmap.md`                                                     |
| `.project/project-context.json` learnings        | ≤ ~15 non-derivable ones → root or nested `AGENTS.md`                 |

You get a preview and one confirmation before anything is written. `/setup` never commits; it
offers `/commit`.

### /build

For features and real bugs. It keeps feature progress in the spec so any new chat can resume.
Small changes don't need it; if it gets one anyway, it takes a light path.

```
/build                         resume the in-progress item, else start the next roadmap item
/build <slug>                  start or resume that feature
/build "make X do Y"           small change or feature, decided by the size gate
/build "fix: X is broken"      bugfix via the debug ladder
```

#### Routing

| Input                        | Path                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| slug with an existing spec   | **Resume** at the step matching `Status`                          |
| slug on the roadmap, no spec | **Feature**                                                       |
| no argument                  | in-progress roadmap item → Resume; else first open item → Feature |
| text describing a bug        | **Fix**                                                           |
| other text                   | **size gate** → Small or Feature                                  |

**Size gate.** A change is _Small_ only if none of these hold:

1. It adds a capability (new page, route, endpoint, model, migration).
2. It touches more than 3 source files.
3. It needs a new test file or harness.
4. It changes a shared layer used by more than 2 modules, or is a cross-cutting rename.

The gate is re-checked while working: as soon as the real scope crosses a line, `/build` stops,
tells you, and switches to the Feature path with a spec for what's left.

#### Small path

Make the change → scoped tests/lint → a screenshot check if it's UI → `lessons` if something
surprising came up → `/commit`.

#### Fix path (debug ladder)

Effort scales with how well the cause is understood, judged from observable signals, never from
"confidence":

| Tier          | When                                                     | What                                                                                                              |
| ------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1 Direct      | cause and symptom both visible; a known value; 1–2 files | change it, re-check live                                                                                          |
| 2 Hypothesis  | symptom clear, cause unproven                            | reproduce → write the hypothesis and what evidence would confirm it → gather that evidence → fix the proven cause |
| 3 Investigate | spans modules, intermittent, or a lower tier failed      | an Explore subagent traces the causal chain with `path:line` evidence; the fix is presented as a plan first       |

Hard rule: **every failed fix moves up one tier**. The same fix is never retried without new
evidence. The fix is done only when the reproduction passes (test green or you confirm it live).
It's logged in the feature's spec under `## Fixes` and committed as `fix:`.

#### Feature path

1. **Define (plan mode).** Reads docs/product.md (non-goals!), decisions, the roadmap line and the code
   it touches. Asks only what it can't answer itself (usually 0–3 questions). Drafts the spec:
   criteria split into happy / edge / error, the approach with files, an ASCII wireframe for UI,
   and which test covers which criterion. More than 6 criteria → it proposes a split. It also
   flags roadmap items this feature makes obsolete.
   **Accept** writes `docs/specs/<slug>.md`, links it from the roadmap line (= in progress) and
   records real decisions in `docs/decisions.md`. Then the **safe point**: Continue here, or
   Fresh start, which drops the exploration and keeps the spec: the mod clears the chat after
   that turn and runs `/build <slug>` in the fresh one (without the mod: `/clear`, then
   `/build <slug>` yourself). Or stop early: **Stop here** keeps just the spec, **Build, then
   stop** builds and leaves verify for later (`Status: verifying`, changes uncommitted until
   Finish). `/build <slug>` or the roadmap pane picks it up at that step.
   The [kit mod](#kit-mod) shows your context % above the prompt to help you choose.
2. **Build (inline).** Test first where testable, then code, following `AGENTS.md`. If the spec
   has a `Design:` source, the UI is built with the `/convert` procedure. Full suite +
   typecheck/lint must be green.
3. **Verify.** A fresh [verifier](#the-verifier-agent) subagent (which didn't build the code)
   checks every criterion with evidence. Failures are fixed and re-checked, max 2 rounds; still
   failing → it stops with the state written into the spec.
4. **Manual.** Only for what can't be automated (real credentials, "does it feel smooth",
   physical device, audio). You get concrete steps + the expected result and answer
   Pass / Fail / Skip. A fail becomes a hypothesis-tier fix and the item is asked again.
5. **Finish.** Spec `Status: done`, roadmap line checked, the verifier's improvement notes (max 3) added under `## Later` in the roadmap **without asking** (delete the ones you don't want;
   `/build` never picks up `## Later` items by itself), `lessons`, then **one commit** with code +
   spec + roadmap. The report suggests `/simplify` for diffs over ~150 lines and
   `/security-review` for auth, stored user input or payments. When the feature closed the last
   open item of its phase, the report says so and suggests `/launch` (`major` for a `vX` heading,
   `minor` for `vX.Y`), then `/roadmap` to sort
   `## Later`. It never pushes.

   Finish asks no questions, so a feature run only stops for the plan approval, the safe point
   right after it, and manual checks that genuinely need you. That keeps it smooth in auto mode.

#### Resuming

Stop anywhere (close the chat, run out of context, come back tomorrow). Before every `Status`
change `/build` rewrites the spec's `## Handoff` (max 5 lines: deviations, failed attempts,
your corrections), so what was only said in the chat survives. In a new chat:

```
/build habit-crud      (or just /build)
```

It reads `Status`, `## Handoff`, the unchecked criteria and `git status`, says in one line where it picks up,
and continues: `defined`/`building` → build, `verifying` → verify, `manual` → manual checks.

### /commit

Safe staging and a clean message. Called by you, or by `/build` as `commit feature=<slug>`.

1. **Pre-flight**: stops if there's nothing to commit or a rebase/merge/cherry-pick is in
   progress. Large diffs (>1500 lines) are judged from the stat instead of being read in full.
2. **Staging safety** (always):
   - never stages secrets (`.env*`, keys, certificates, `credentials.json`, `*.tfvars`, service
     account files);
   - warns and asks for files over 1 MB, binaries, deletion of critical files (`package.json`,
     lockfiles, `tsconfig.json`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `.github/`), and for
     `.gitignore` changes that untrack files;
   - offers to add missing `.gitignore` patterns for secrets, `node_modules/`, build output,
     `.DS_Store` and logs that are actually present.
3. **Branch, then grouping**: in `branches` mode on the default branch it first offers a new
   branch (so plain-chat work doesn't land on main). Then changes in separate concerns → offers one commit per group (whole files only,
   never hand-split hunks). In `feature=<slug>` mode it's always one commit.
4. **Message**: detects the repo's style from the last 20 subjects. Conventional Commits
   (`type(scope): description`, ≤72 chars, imperative, English, no emoji) when the repo uses it;
   otherwise it mirrors the repo's style (ticket prefix, `[TAG]`, plain). A ticket id in the
   branch name is used.
5. **Confirm**: shows the message and asks Commit / Edit / Cancel, unless you already said to
   commit or it runs from `/build`. A failed pre-commit hook → fix and make a **new** commit
   (never amend after a failure); `--no-verify` only if you choose it.
6. **Push**: only when you asked in the same request or say yes now. The push itself goes
   through the [push-guard](#push-guard).

### /convert

Visual input → UI code in your stack, checked against the source in the browser.

```
/convert <image | figma-url | site-url> [target file or route]
```

| Source                      | How it's read                                    |
| --------------------------- | ------------------------------------------------ |
| image / screenshot / sketch | read as an image                                 |
| Figma URL                   | Figma MCP: design context, variables, screenshot |
| live URL                    | browser screenshot + computed styles per section |

**Modes** (picked from the source; asked only when ambiguous):

- **Sketch → hi-fi**: layout from the sketch, all colours/spacing/type from your tokens.
- **1:1 copy**: a finished design; exact values, each mapped to the nearest existing token.
- **Inspiration**: borrow structure and feel; every visual value from your tokens.

**Steps**: find tokens (CSS variables, Tailwind config or theme file; none → derive a small set
and add them as CSS variables) → **plan mode** with sections, reused components, a source → token
mapping table, assets and the mobile layout → build (flex/grid, semantic HTML, real copy,
exported assets) → **verify loop** (max 3 rounds: screenshot vs source, console errors, fix
layout → spacing → details; for 1:1 copies also computed values) → mobile check at 375 px (no
horizontal overflow) → you approve the final screenshot.

An existing target file is treated as a **patch**: everything the source doesn't show (data
fetching, props, handlers, real copy) is kept. Standalone it ends with `/commit`; inside `/build`
it is just the build step.

### /theme

One source of truth for colors, type, spacing, radii, shadows and motion, written in the
project's own idiom so `/convert`, `/build` and the frontend rule use tokens instead of raw values.

```
/theme "calm, trustworthy, B2B"     from a brief (+ the product's audience)
/theme ~/Desktop/moodboard.png      from an image
/theme https://example.com          from a live site (computed styles)
/theme from-code                    consolidate raw hex/px values already in the code
```

1. **Detect** existing tokens (Tailwind v4 `@theme`, `tailwind.config`, `:root` variables, a
   theme file). Found → update mode.
2. **Propose in plan mode**: semantic color roles (`bg`, `surface`, `fg`, `muted`, `border`,
   `primary`, …) with dark values, a neutral scale, type families and scale, spacing, radii,
   shadows and motion (with `prefers-reduced-motion`). Every text/background pair gets a
   **computed** WCAG contrast ratio (≥ 4.5:1 body, ≥ 3:1 large/UI); failing pairs are fixed
   before you see the plan. The proposal opens in the [theme pane](#kit-mod) (colors with
   ratios, real fonts, type scale, spacing, radius, shadow, a sample card in both themes).
3. **Write** to `@theme`, the Tailwind config, or `:root`, plus fonts the framework's way. With
   `from-code` you choose whether to replace the raw values now.
4. **Record** one convention line in `AGENTS.md` ("use the tokens in <file>"), and a real
   direction choice in `docs/decisions.md`.
5. **Verify** existing pages in both themes in the browser.

`/convert` recommends running `/theme` first when a project has no tokens yet.

### /improve

The way kit improves itself without growing back into v1. Only you can start it (it doesn't
appear in Claude's skill list, so it costs no context).

```
/improve build "the size gate sent a 2-file copy change to the feature path"
/improve commit            (uses the Skill Feedback points raised earlier in the chat)
```

1. **Locate** the kit repo (the plugin folder if it's a git repo, else `~/Projects/claude-kit`)
   and read only that skill, its references/scripts and the budget rules.
2. **Diagnose** each observation down to the line that caused it, and classify it: wrong
   default, ambiguous line, missing failure path, over-strict rule, duplicate of a native
   feature, hand-done deterministic work (→ script), or a new capability (pushed back on first).
   No causing line → it's probably model behaviour; no edit for a one-off.
3. **Propose in plan mode** as before → after snippets with the line delta per file. Deleting
   and replacing beat adding; net growth needs a one-sentence reason; budgets still hold.
4. **Check**: budgets, `claude plugin validate`, the push-guard test when hooks changed, a real
   run of a touched script.
5. **Commit** in the kit repo as `fix(<skill>)` or `refactor(<skill>)`; to use it, bump `version` in `.claude-plugin/plugin.json`, then `claude plugin marketplace update airmile && claude plugin update kit@airmile` and start a new session.

Together with the Skill Feedback rule in `~/.claude/CLAUDE.md` this is the loop: friction is
noticed during a run → raised after the report → you approve → `/improve` applies it.

### /launch

The step from "done on my branch" to "live", for solo and team work.

```
/launch               detect the release model and take the current work live
/launch minor         versioned projects: force the version bump
```

1. **Detect** the release model. *Continuous* (a host such as Vercel or Netlify deploys the
   default branch): going live = merging to the default branch. *Versioned* (`v*` tags, a
   `CHANGELOG.md`, a publishable package): version bump + changelog + tag. A release bot such as
   release-please present → kit does the checks and the merge, the bot does the versioning.
2. **Checks**: build, tests, typecheck/lint, then a scan of what goes out: database migrations
   (and whether the deploy runs them), new environment variables missing from `.env.example`,
   changed host/runtime config, new or major-bumped dependencies, sensitive areas that deserve
   `/security-review`.
3. **Release notes** from your conventional commits, rewritten as user-facing lines. Versioned
   projects get the next semver version from the commit types (`!` → major, `feat` → minor,
   else patch).
4. **Go / no-go** block: risk in plain language, what must happen before (migrations, env vars),
   and the rollback path. Nothing happens until you say Go live.
5. **Go live**: changelog + version commit (versioned), PR + squash merge (or the desktop app's
   auto-merge), push, and a tag on the merged commit: `vX.Y.Z`, or `release-YYYY-MM-DD` as a
   rollback anchor for continuous deploys. Without `gh` it merges locally from the main checkout
   (from a worktree it tells you to). No remote yet → it offers to create a private GitHub repo.
   Never publishes to a package registry without a separate OK.
6. **After**: checks that the production URL (from `AGENTS.md`) answers once the host deployed.
7. **Clean up**: deletes the merged branch, and lists other worktrees whose branch is merged and
   clean, offering to archive those sessions (the app asks you per session). With
   *Auto-archive after PR merge or close* on, the current worktree session archives itself.

### /audit

A sweep over a whole site before you deliver it or launch a big change, beyond what a
feature's verify covers.

```
/audit                          the local app (production build preferred)
/audit https://staging.example  a deployed site
```

Pages come from `sitemap.xml`, else from following links (max 30), else from the routes on disk.
Every page is opened in the browser at desktop and mobile width and checked with a small script
(`references/page-check.js`) plus axe-core: console errors, failed requests, broken internal
links, horizontal overflow, accessibility violations, missing title/description/og:image,
images without alt or far larger than shown, unlabeled inputs, and (when Lighthouse is
available) speed. Findings are grouped across pages as blocker / should fix / nice. You pick
which groups to fix now (the small safe ones are recommended); the rest goes under `## Later` in
the roadmap. The report can be saved as `docs/audits/<date>.md` to show a client what was
checked.

### /explain

Understand your own code. It never changes anything.

```
/explain                 the uncommitted changes, else the last commit
/explain habit-crud      a feature: its spec plus the commits that built it
/explain src/streak.js   a file or function with its callers
/explain "how does login work?"
```

It adapts to the **Explanation Level** in your `~/.claude/CLAUDE.md` (Novice: every term
defined, small steps). The explanation follows one realistic case through the code in execution
order (with `path:line` and *why* it's written that way), names 1-2 ways it could break, then
asks 2-3 multiple-choice questions to check understanding, re-explaining a part when an answer
is wrong.

### lessons (Claude-only)

Not in the `/` menu; Claude invokes it at the end of `/build`, `/convert` and fixes, or whenever
it learns something worth keeping. It writes a lesson only when it is **not derivable** from the
code, **changes what the next session does**, and was **actually observed** (a bug, a failed
attempt, your correction). Zero lessons is the normal outcome.

- Module-specific → `<dir>/AGENTS.md` (created if needed; ≤40 lines)
- Project-wide → root `AGENTS.md` under Pitfalls/Conventions (root stays ≤100 lines)
- A decision with a rejected alternative → `docs/decisions.md` instead

It merges with existing lines instead of appending duplicates, and prunes lines that became false
or derivable.

This replaces v1's learnings system (JSON store, load/write scripts, extractor agent): Claude
Code itself loads the right `AGENTS.md` at the right moment.

---

## The verifier agent

`agents/verifier.md` runs on **Sonnet** in a fresh context, so it judges the code without the
builder's assumptions. `/build` gives it the spec path, the dev command + port and the changed
files.

- It **doesn't edit source files** (throwaway scripts in a temp dir are allowed and removed).
- It runs the full suite and typecheck/lint, and gives every criterion **pass/fail with
  evidence**. A test only counts if its assertion really exercises the criterion.
- UI criteria are checked in a browser (Playwright MCP, the built-in browser or a Playwright
  script), including console errors.
- In doubt whether a human is needed → it automates. Manual items come back as numbered steps a
  non-developer can follow, plus an observable expected result.
- At most 3 improvement notes, each naming a file + symbol and a concrete change. Zero is normal.

---

## Hooks

Both hooks and the context mod ship with the plugin (`hooks/hooks.json`) and cost no context
tokens.

### push-guard

`PreToolUse` on Bash. Any `git push` (also `git -C dir push`, chained commands) needs your OK:

| Permission mode              | What happens                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| default / acceptEdits / plan | the normal permission prompt appears                                                                                               |
| auto                         | the permission prompt appears too: auto mode still shows prompts a hook asks for                                                   |
| bypassPermissions            | the push is **denied** with a message telling Claude to ask you in chat; after you confirm, Claude runs `KIT_PUSH_OK=1 git push …` |

When you already said "push" (e.g. `/commit` and you answered Push, or "commit and push"),
Claude runs `KIT_PUSH_OK=1 git push`, so you aren't asked twice.

Why this matters in auto mode: by default the auto-mode classifier lets Claude push to any branch
of your repo, including `main`, without asking. On some hosts a push to `main` is a production
deploy. Why deny instead of ask in bypass mode: Claude Code's docs guarantee that a hook's `deny`
holds even in bypass mode, but don't say the same for `ask`.

### format-on-save

`PostToolUse` on Write/Edit. Formats the edited file with **Biome** when the project has a
`biome.json` (for JS/TS/CSS/JSON) and **Prettier** otherwise (also Markdown, HTML, YAML, SCSS,
GraphQL). Failures are silent; formatting never blocks an edit.

### kit mod

A [mod](https://code.claude.com/docs/en/plugins/mods/overview) (`hooks/register.tsx` and the
files next to it): code that runs inside Claude Code. **Requires Claude Code 2.1.287+**; older
versions skip it. It never writes files.

**Context** (reads the spec of the current `feat/<slug>` or `fix/<slug>` branch):

- **After a compaction** (auto or `/compact`) it adds one line to the new context: slug,
  `Status`, criteria done, and "re-read the spec, `## Handoff` first". That line comes from
  disk, not from the summary, so it is always right.
- **Above the prompt**, only while the spec is `defined` (the safe point): your context % and
  whether a fresh start is worth it (from 60%). After a `/clear` the old figure is dropped.
- **Usage**: `ctx 114k · session 55% · 2h 53m · week 75% · 4d 3h` on top of the roadmap
  dashboard, each limit with the time until it resets; updated after every turn.

**Panes** (docked on the right in the Desktop Code tab and a fullscreen terminal ≥ 110
columns, above the prompt otherwise):

- **Roadmap**: `/roadmap` (no argument) opens a project dashboard, titled with the product's name. On top, in its own block:
  context and plan usage (a value turns amber from 60%, red from 85%) with **Compact** and **Clear**; git state (branch,
  changed files, commits not on `origin/HEAD`) with **Diff** (`/diff`, where it exists) and
  **Commit** when files changed and **Launch** when commits aren't live; then kit's skills:
  **Setup** (only when `AGENTS.md` is missing), **Ideas**, **Critique**, **Theme** and
  **Audit**. One click on a button runs its command at once (a second click within 2 seconds
  counts as a double click and is ignored; if running fails, the command lands in your prompt box); a done
  feature's **Explain** runs `/explain <slug>`. On the desktop app a click also counts when
  the pane didn't have focus yet; the catch is that Tab onto a button there presses it. Below that, `docs/roadmap.md` live, grouped by phase (a release: `v1 · MVP`, `v1.1 · Sharing`; any `##` heading works, shown as written): a
  card per feature with its state, and for one in progress its step (define → build → verify, with the criteria count while verifying). **Pick
  up** (open), **Build** (spec ready), **Resume** (building) or **Verify** (ready to verify)
  clears the chat and runs `/build <slug>` in the fresh one, which continues at that step. A feature not started has **▶** (Pick up), on the desktop app **↗** (a chip that starts `/build <slug>` in a new worktree session; the card then says "sent to worktree", later "runs on <branch>" once that session commits the spec, and pressing ↗ again asks "Again?") and **⋯**, a row of buttons that
  move it to another phase or to `## Later`, or remove it; a phase heading folds its
  cards (a folded heading turns dim), finished phases wait behind one "✓ v1 · MVP, …" line, and in an unfinished one the done features fold into one "✓ n done" line; **Remove** asks once ("Remove?") before it acts; **+ Add** in a phase heading adds one, and **+ Add** in the Later heading adds an idea there; a Later idea's ⋯ restores it. Done and in-progress features can't
  be edited there (their state is `/build`'s). The whole heading text folds a phase, or Later. In plan
  mode it shows the draft, read-only, without the dashboard.
- **Theme**: `/theme` shows its proposal before you approve it: colors for light and dark
  with contrast ratios, a sample card and button, the type scale in the real fonts, spacing,
  radius and shadow. Google Fonts are fetched as a small glyph subset and embedded (needs
  network and Node 18+); offline the system font is used. The terminal gets swatches and
  text. Contrast is computed by the mod and returned to Claude, which fixes failing pairs.

The skills pass their data to the panes as tool calls (`mcp__kit__roadmap_view`,
`mcp__kit__theme_view`); those are display-only and allowed without a prompt. So is
`mcp__kit__fresh_start`, which `/build` calls only after you picked Fresh start.

Trunk mode or no matching spec → the context part shows nothing. To turn every mod off, set
`"disableAllHooks": true` (this also stops push-guard and format-on-save).

---

## Git, branches and parallel sessions

**One workflow for solo and team: GitHub flow.** The default branch is always live (on Vercel
and similar hosts, a push to it deploys). Every feature or fix gets its own branch; it reaches
the default branch through a PR. Solo, you merge your own PR; in a team someone reviews it
first. The flow is the same, only the review step differs.

Set per project in `AGENTS.md § Git` (`/setup` asks):

| Mode | When | What the skills do |
| --- | --- | --- |
| `branches` (default) | the host deploys from the default branch, or team work | `/build` creates `feat/<slug>` / `fix/<slug>` when you're on the default branch; `/commit` offers push + PR on a feature branch and warns before pushing the default branch; `/launch` merges |
| `trunk` | solo, **one session at a time**, nothing deploys from the default branch (e.g. school projects) | commits straight to the default branch |

**Parallel sessions: use the desktop app's worktrees.** Start each task in its own session with
the **worktree** option next to the branch name. Every session then has its own copy of the
project on its own branch, so sessions can't overwrite each other's files. kit doesn't build its
own worktree system; it makes itself safe for this:

- **Specs travel with the branch.** `docs/` is committed, so a worktree has the full roadmap and
  specs without any syncing (v1 needed symlinks for this).
- **Claims.** `/build` commits a feature's spec as soon as you approve the plan. Other sessions
  see that commit (worktrees share git history), and `/build` never starts a slug that is
  claimed on another branch: without an argument it takes the next free item.
- **Fresh worktrees start ready.** `/setup` writes a `.worktreeinclude` with the gitignored
  files a worktree needs (such as `.env`), and `AGENTS.md § Git` names the install command that
  `/build` runs first in an empty worktree.
- **Own dev server per session.** The default port may already serve another session's code
  (or the app's own preview). So every session uses only a server it started itself, on a free
  port when the default is taken, with the app's URL variables (e.g. `NEXT_PUBLIC_SERVER_URL`)
  pointed at it; the verifier tests only the URL it is given. The rule lives in
  `AGENTS.md § Git`, so it also holds in plain chats. `/setup` turns on `autoPort` in
  `.claude/launch.json` so the app's preview picks a free port by itself.
- **Shared state outside git.** Worktrees share everything git doesn't track, such as a local
  database. Some frameworks change the schema just by running (Payload's Postgres adapter pushes
  its schema in development), so `/setup` writes a database line in `AGENTS.md § Git`: its own
  `DATABASE_URL` per worktree, or schema push off outside the main checkout, and migrations
  only from the main checkout.
- **Merge conflicts** in `docs/roadmap.md`, `docs/decisions.md` or `AGENTS.md` when a branch syncs
  with the default branch are resolved by keeping both sides' lines (each session adds its own).
- **Add roadmap items from inside the worktree session** that will build them. A new worktree
  can start from `origin/<default>` rather than your local branch, so an unpushed roadmap edit on
  main may be missing there (and pushing main may deploy).
- **Claims reach teammates.** With a remote, `/build` pushes the feature branch right after the
  plan is approved (the plan says so), and fetches before checking claims.
- **Worktrees are always the app's.** `/build` never creates one itself: a worktree made from
  inside a session works for git, but the desktop app doesn't know about it, so you'd lose the
  PR panel, syncing with the base branch and auto-archive (tested).

How two parallel sessions play out:

```
Session A (+ New session, "worktree")        Session B (same)
 own branch + .env (.worktreeinclude)         own branch + .env
 /build → installs deps → takes "reminders"   /build → skips "reminders" (claimed)
 plan → accept → spec commit = claim           → takes "streaks" → spec commit
 build → verifier on its own port             build → verifier on its own port
 → commit → push + PR                          → commit → push + PR
 app follows CI → merge (or /launch)           same; roadmap conflict → keep both lines
 → session auto-archives, worktree removed
```

**Recommended desktop settings** (Settings → Claude Code): a branch prefix to keep these
branches together, and *Auto-archive after PR merge or close* so finished sessions clean
themselves up. After `/commit` opens a PR, the app follows its CI and can auto-fix or
auto-merge it.

### Plain chats (no skill)

Small changes in a normal chat still get most of kit, because it lives in files and hooks rather
than in skills:

| Still applies | How |
| --- | --- |
| Project rules, dev-server and database rules, merge-conflict rule | root `AGENTS.md` (loads every session) |
| Module pitfalls | nested `AGENTS.md`, when Claude reads files there |
| Frontend habits | `rules/frontend.md`, when Claude reads a frontend file |
| No unasked pushes, formatting | the push-guard and format-on-save hooks |
| Branch first in `branches` mode | `/commit` offers a branch when you're on the default branch |

What a plain chat skips on purpose: specs, claims and the independent verify. That's fine for
small changes; use `/build` once it's a feature.

## Common flows, step by step

| Situation                 | Flow                                                                     |
| ------------------------- | ------------------------------------------------------------------------ |
| New idea                  | `/roadmap` → `/setup` (scaffold) → `/build` → `/build` …                      |
| Existing repo, no kit yet | `/setup` → `/roadmap` → `/build`                                             |
| v1 project                | `/setup` (migrate) → check the roadmap → `/build`                         |
| Interrupted work          | new chat → `/build` (or `/build <slug>`)                                   |
| Bug in a finished feature | `/build "fix: …"` → logged in that spec's `## Fixes`                      |
| Small tweak               | just ask in chat, then `/commit`                                         |
| Several things at once    | one desktop session per task, each with the **worktree** option; `/build` in each |
| Go live / release         | `/launch` (checks, notes, merge or version tag)                          |
| Before delivering a site  | `/audit` → fix the small things → `/launch`                              |
| Understand what was built | `/explain` (last change), `/explain <slug>` or `/explain <file>`          |
| New idea mid-project      | `/roadmap add <idea>`; verifier notes are also offered as roadmap items     |
| Rethink the plan          | `/roadmap critique`                                                         |
| Design → code             | `/convert <source>`, or put the source in a spec's `Design:` and `/build` |
| Visual foundation         | `/theme` before the first UI work, or `/theme from-code` to clean up |
| A kit skill annoyed you   | `/improve <skill> "what happened"` |
| Commit stray work         | `/commit`                                                                |

**Example: building one feature**

```
you   /build
kit   Next open item: habit-crud. (enters plan mode, reads product.md + code)
kit   One question: should deleting a habit also delete its history?  [Yes / Keep history / …]
you   Keep history
kit   (plan: 3 criteria, approach, tests, wireframe)          → you accept
kit   writes docs/specs/habit-crud.md, links it in the roadmap
kit   builds test-first; suite green
kit   verifier: 3/3 pass (2 by test, 1 in browser), 0 manual
kit   adds the verifier's 1 improvement note under ## Later
kit   commit: feat(habit-crud): add create, rename and delete
      BUILD · habit-crud · feature
      criteria   3/3 verified (0 manual)
      later      +1 idea added under ## Later
      next       streaks
```

---

## What Claude loads, and when

| When                            | What                                                     | Cost              |
| ------------------------------- | -------------------------------------------------------- | ----------------- |
| Every session                   | kit's skill/agent descriptions                           | ~200 tokens       |
| Every session                   | `~/.claude/CLAUDE.md` and the project's root `AGENTS.md` | your files        |
| Claude reads a file in `src/x/` | `src/x/AGENTS.md`                                        | only then         |
| You run a skill                 | that skill's `SKILL.md` (~0.4k–1.6k tokens)              | only then         |
| `/build` fix path / define       | `references/debug.md` / `references/spec-template.md`    | only on that path |
| `/build` verify                  | the verifier runs in its own context                     | not in your chat  |
| A skill needs project state     | the relevant `docs/` file                                | on demand         |

Hooks run outside the model and add no tokens.

---

## Coming from claude-config v1

The cutover is done: v1's skills, agents and scripts are no longer linked into `~/.claude/`, its
format and security hooks were removed from your settings (the official `security-guidance`
plugin replaces the latter), and `~/.claude/CLAUDE.md` was trimmed. Everything was moved, not
deleted: `~/.claude/backups/v1-cutover-2026-10-01/RESTORE.md` puts it all back.

Per project, run `/setup` once: it migrates `.project/` and the generated `CLAUDE.md` into
`AGENTS.md` and `docs/`, and lists leftover v1 worktrees with what is still in them, asking per
worktree whether to keep or remove it.

---

## Troubleshooting

**Nested `AGENTS.md` notes seem ignored.** A `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`
in the project stops Claude Code from reading `AGENTS.md` at all; run `/setup` (see
[No CLAUDE.md in your projects](#no-claudemd-in-your-projects)).
Run `/memory` or `/context` and look for the file under memory files. Nested files only load
after Claude reads a file in that directory.

**`/build` isn't found.** Run `claude plugin details kit`; in an open session run
`/reload-plugins`. If another skill uses the bare name, use `/kit:build`.

**A push was denied.** That's the push-guard in bypass mode. Say "yes, push" in chat; Claude
re-runs it with `KIT_PUSH_OK=1`.

**The verifier says "manual" for something it could test.** It's instructed to automate when in
doubt; a manual item should only cover credentials, perception, devices or audio. Answer it,
then add the test as a roadmap item if it matters.

**A spec and the code disagree after a crash.** `/build <slug>` compares the spec with
`git status` on resume and tells you what it found. Correct the spec's `Status` by hand if needed.
It's just markdown.

---

## Evals

kit ships an eval suite (`evals/`) for `claude plugin eval`. Each case builds a tiny repo with
a fixture script, sends one prompt to a fresh, isolated `claude -p` session with only kit loaded,
and grades what happened: files written, tools called, the order of calls, text in the reply.

| Case | What it guards |
| --- | --- |
| `build-routes-small` | a one-line change takes the small path: no spec, no plan mode |
| `build-routes-feature` | a roadmap feature goes through plan mode with happy/edge/error criteria, no code edits yet |
| `build-routes-fix` | a bug is reproduced (tests run) before the code is edited, and actually fixed |
| `build-resumes` | `/build` with no argument resumes the in-progress spec and starts the verifier |
| `commit-blocks-env` | `staging-check.js` runs and a `.env` file never ends up in the commit |
| `commit-no-push` | `/commit` commits but never pushes on its own |
| `setup-migrates-v1` | the v1 migration keeps real items/lessons and drops v1-only ones (judged by a model) |
| `lessons-nested` | a module-specific lesson lands in that module's `AGENTS.md` |

Runs are non-interactive: nobody answers questions or approves plans. So the suite tests the
**decisions and safety rules** of the skills, not complete interactive flows.

**How Claude uses it.** `/improve` runs the evals of the skill it changes before and after the
edit, and refuses to commit when a score drops. Before fixing a behaviour bug it first writes a
regression case that fails, so every real piece of friction becomes a permanent test.

**Running it yourself**

```bash
cd ~/Projects/claude-kit
# cheap: one run per case, no baseline (~1 agent run per case)
claude plugin eval . --trust-plugin --scaffold --allow-tools Bash Write Edit EnterPlanMode ExitPlanMode \
  --runs 1 --ablation none --no-publish --threshold 0 --max-cost-usd 3
# full: 3 runs per case + a no-plugin baseline, to see what kit adds (Δ)
claude plugin eval . --trust-plugin --scaffold --allow-tools Bash Write Edit EnterPlanMode ExitPlanMode \
  --max-cost-usd 15
```

Every run is a real model call on your plan. The full run is worth doing after a model release:
a case whose Δ drops to ~0 means plain Claude now does that part on its own, and the skill line
behind it can go. Eval runs use the CLI's own login: if they fail with `Not logged in`, run
`claude auth login` in a terminal.

## Developing kit

```
.claude-plugin/plugin.json        manifest (name: kit)
.claude-plugin/marketplace.json   marketplace (airmile)
skills/<name>/SKILL.md            one workflow per skill
skills/build/references/           debug.md, spec-template.md (loaded on demand)
skills/commit/scripts/            staging-check.js
skills/setup/scripts/             migrate-v1.js
agents/verifier.md
hooks/hooks.json, push-guard.cjs, push-guard.test.cjs, format-on-save.cjs
rules/frontend.md                 user rule, symlinked into ~/.claude/rules/
AGENTS.md                         rules for working on this repo
```

Rules (also in `AGENTS.md`):

- **Budgets**: `SKILL.md` ≤ 150 lines (`build` ≤ 200), max 2 files in `references/`. Check with
  `wc -l skills/*/SKILL.md`.
- **No `shared/` folder and no state files.** Skills share files in the target project, and
  each file documents its own format in its header. Changing a format means changing the
  template in the skill that owns that file.
- **Scripts only for deterministic checks or conversions** (Node, cross-platform), referenced as
  `${CLAUDE_SKILL_DIR}/scripts/…` and listed in the skill's `allowed-tools` so they run without
  a permission prompt. Never for reading or editing roadmap/spec files.
- Hooks and scripts must also work on Windows.
- A rule that needs a paragraph of exceptions should be cut, not extended.
- Skill and agent files are written in English; runtime output follows the user's language.
- Prefer native Claude Code features over custom machinery.

Test loop:

```bash
claude plugin validate ~/Projects/claude-kit
node hooks/push-guard.test.cjs
claude plugin details kit
```

Then run the skill on a sandbox project in `claude --plugin-dir ~/Projects/claude-kit`, or
bump `version` in `.claude-plugin/plugin.json`, then `claude plugin marketplace update airmile && claude plugin update kit@airmile` and start a new session.

The scripts can also be run by hand: `node skills/commit/scripts/staging-check.js` in any repo,
`node skills/setup/scripts/migrate-v1.js <project>` on a v1 project (read-only).
