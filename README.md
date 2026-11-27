# kit

A small Claude Code plugin for building software with Claude. It covers the whole loop: shape an
idea, turn it into a backlog, build features one at a time (spec → code → independent verify →
commit), fix bugs with discipline, and convert designs into code.

kit is the successor to `claude-config` v1. v1 grew to 42 skills, ~15k lines of shared
instructions and its own state engine (JSON state files, a backlog server, checkpoints, a sync
branch). Most of the friction came from that machinery, not from the actual work. kit keeps the
workflow and drops the machinery: all state is plain markdown in your repo, and wherever Claude
Code already has a native feature (subagents, `AGENTS.md` loading, `/simplify`,
`/security-review`) kit uses it instead of rebuilding it.

```
18 skills · 1 agent · 2 hooks + 1 mod (1 pane) · 7 scripts · ~1970 lines of skills · ~420 tokens always-on
```

---

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Core idea: your repo is the state](#core-idea-your-repo-is-the-state)
- [Files kit maintains in your project](#files-kit-maintains-in-your-project)
- [Skills](#skills)
  - [/product](#product)
  - [/setup](#setup)
  - [/commit](#commit)
  - [/convert](#convert)
  - [/theme](#theme)
  - [/improve](#improve)
  - [/codex](#codex-1)
  - [/launch](#launch)
  - [/audit](#audit)
  - [/scan](#scan)
  - [/intake](#intake)
  - [/seo](#seo)
  - [/explain](#explain)
  - [/task-readiness](#task-readiness)
  - [/distill-skill](#distill-skill)
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

The plugin is read straight from the clone, uncommitted edits included (see
[Update](#update--uninstall)); `/commit` pushes them to GitHub.

Check with `claude plugin details kit`: it should list 18 skills, 1 agent and 2 hooks. Skills
are available in **new** sessions; in a running session use `/reload-plugins`.

Skills are namespaced as `/kit:<skill>` (e.g. `/kit:task-readiness`). The bare name (`/task-readiness`) also works as
long as no other skill or command uses it.

### No CLAUDE.md in your projects

kit keeps project instructions in `AGENTS.md`, including nested ones per module. Claude Code
(v2.1.277+) reads root and nested `AGENTS.md` files natively, but **only when the project has no
`CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`** (docs: memory § AGENTS.md). So kit
projects have none: `/setup` moves anything useful from an existing `CLAUDE.md` into `AGENTS.md`
and removes it after you confirm. One in a parent folder blocks `AGENTS.md` too; `/setup` only
reports it. Your personal `~/.claude/CLAUDE.md` doesn't count and keeps working.
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

- A local-folder install reads this repo directly: start a new session or run `/reload-plugins`
  to use edits. A release for the copies (Codex, claude.ai) bumps `version` in both
  `plugin.json` files. A GitHub install updates with `claude plugin marketplace update airmile
  && claude plugin update kit@airmile`.
- The desktop app can load its own copy from the claude.ai marketplace `claude-kit` (synced from
  GitHub) instead. After a push, press **Check for updates** there (claude.ai › Add › Manage
  marketplaces; "Sync automatically" has lagged behind) and start a new session.
- Try edits without installing: `claude --plugin-dir ~/Projects/claude-kit`.
- Remove: `claude plugin marketplace remove airmile` (also uninstalls the plugin).

### Codex

Codex reads the same marketplace (`.claude-plugin/marketplace.json`) and `.codex-plugin/plugin.json`,
so one repo serves both tools at one version.

```bash
codex plugin marketplace add ~/Projects/claude-kit
codex plugin add kit@airmile
```

- **Trust the hooks once** (and again after they change): Codex skips plugin hooks until you
  review them (docs: Hooks › Review and trust hooks). Until then push-guard is off in Codex.
- **What differs**: the skills are worded for Claude Code. At session start a hook adds
  `hooks/codex-context.md`, which maps the Claude terms: questions become numbered options in
  chat, plan-mode approval becomes "plan shown, wait for your OK", the verifier runs as a
  subagent reading `agents/verifier.md`. No panes: `/theme`
  shows its table. Resume a spec with `/task-readiness <slug>`. The frontend
  rule is read from `rules/frontend.md` on UI work.
- **Projects are shared**: `AGENTS.md` and `docs/` are the same for both tools, so a spec
  started in Claude Code resumes in Codex and the other way around.
- **Update**: bump `version` in both `plugin.json` files, then `codex plugin add kit@airmile`
  and start a new session.

### Skill Feedback inbox

Friction points raised after a kit skill run (see `/improve`) go to `~/.agents/kit/feedback.md`,
one line per point, from both tools. Both need write access there once:

- Codex (`~/.codex/config.toml`): `writable_roots = ["/Users/<you>/.agents/kit"]` (absolute) under
  `[sandbox_workspace_write]`.
- Claude Code (`~/.claude/settings.json`): allow `Edit(~/.agents/kit/**)`.

No access → the point is shown in chat with a note that it wasn't saved.

---

## Quick start

**A brand-new idea**

```
/setup a habit tracker for people who quit after a week
                  → /product interview, scaffold, AGENTS.md
                    (started outside a project? it makes the folder first)
/task-readiness <item>      → work on a backlog item
```

**An existing repo**

```
/setup            → reads the repo, writes AGENTS.md + docs/
/product             → writes docs/product.md and the backlog from a short interview
/task-readiness <slug>
```

**A quick change**: no skill needed. Ask for it in plain words (auto mode is fine), then:

```
/commit
```

`AGENTS.md` and the frontend rule load in every chat, so a plain request still follows the
project's conventions. Use `/task-readiness` once it's a real feature or a bug whose cause isn't obvious:
that's where the spec, the independent verify and resuming in a new chat pay for themselves.

**A bug**

```
/task-readiness "fix: saving a habit twice creates a duplicate"
```

**Going live**

```
/launch
```

**A design**

```
/convert https://figma.com/design/<file>/<name>?node-id=12-34 app/pricing/page.tsx
```

---

## Core idea: your repo is the state

kit has no database, no JSON state, no background server and no checkpoint files. Everything a
skill needs to know lives in a handful of markdown files **committed to your repo**:

- They sync between your machines through git, like the rest of your code.
- A new chat can pick up any interrupted work by reading them (`/task-readiness <slug>` resumes from the
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
    ├── decisions.md       decisions + the alternative that was rejected
    ├── seo.md             intake answers, search terms, page plan, measurements (SEO work)
    └── specs/
        └── <slug>.md      one per feature: criteria, status, verify result, later fixes
```

| File                   | Written by                    | Read by                                        | Loaded into context                          |
| ---------------------- | ----------------------------- | ---------------------------------------------- | -------------------------------------------- |
| `AGENTS.md` (root)     | `/setup`, `lessons`           | every session                                  | always, at session start                     |
| `<dir>/AGENTS.md`      | `lessons`                     | every session                                  | lazily, when Claude reads a file in that dir |
| `docs/product.md`      | `/product`                    | `/task-readiness`, `/convert`, `/setup`        | on demand                                    |
| `docs/specs/<slug>.md` | `/task-readiness`             | `/task-readiness`, verifier                    | on demand                                    |
| `docs/decisions.md`    | `/task-readiness`, `/setup`   | `/task-readiness`                              | on demand                                    |
| `docs/seo.md`          | `/scan`, `/intake`, `/seo`    | `/seo`, `/task-readiness`, `/audit`, `/launch` | on demand                                    |

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

## Backlog

- The backlog is the Todoist project `Habits`. Do not keep a list in the repo.
- Add items only after the user confirms; complete one only after the user confirms.

## Git

- Workflow: branches
- Fresh worktree: `pnpm install` before anything else

## Docs

- Product intent: `docs/product.md` · specs: `docs/specs/`
- Decisions and why: `docs/decisions.md`
```

The **Commands** section matters: `/task-readiness` and the verifier use the dev command and port from it
to run browser checks.

Nested `AGENTS.md` files hold pitfalls that only matter in one module. Because they load only
when Claude touches that directory, they cost nothing the rest of the time.

### docs/product.md

Product intent, under ~60 lines. Sections: **What**, **For whom**, **Why now**, **Core
experience**, **Non-goals**, **Stack**, **Open questions**. `/task-readiness` reads the non-goals before
defining a feature, so scope creep is caught early.

### The backlog

The backlog is not a file. `AGENTS.md § Backlog` names where it lives (a Todoist project, an
issue tracker) and its rules; `/product`, `/setup`, `/audit`, `/scan` and `/seo` read and write
it there with that tool, each write after your confirmation. Without a backlog, or when the
session can't reach it (no connector, e.g. in Codex), they list the items in the chat and say
they were not saved. A repo that still has `docs/roadmap.md` is offered a one-time move.

### docs/specs/\<slug\>.md

Used by `/task-readiness` for work spanning chats; it names its backlog item. It is both the contract and the resume point:

```markdown
# habit-crud

Status: building
Backlog: habit-crud
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

### /product

Turn an idea into `docs/product.md` + a backlog, or update them later.

```
/product <idea>          new project (when docs/product.md doesn't exist)
/product add <item>      update: add, reorder, remove or reword backlog items
/product critique        stress-test product.md and the backlog, then offer edits
/product brainstorm      find new features, then pick which go on the backlog
```

**New**

1. Takes your idea (or asks one open question).
2. Shows the draft product.md and the backlog items in the chat: that is what you approve.
3. Runs 1–3 rounds of clickable questions (audience, MVP size, core experience, stack, then
   gaps). Vision and naming are asked as open questions; visual choices are shown as small
   mocks; competing designs get a trade-off table first.
4. **Accept** writes `docs/product.md` and adds the items to the backlog; **Revise** shows it
   again.

Item rules: every item is a user-visible capability buildable in one `/task-readiness` run (≤ ~6
acceptance criteria, otherwise split); dependencies first, then value; greenfield projects start
with a `scaffold` item; 5–15 items for an MVP, the rest in the backlog's ideas section.

**Update** finds the right position for a new item, checks it against the product's non-goals
(conflict → asks whether the non-goal changes or the item is dropped), never touches done or
in-progress items, and shows the changes before writing.

**Critique** and **Brainstorm** run one technique at a time as a dialogue. You pick a technique
from 2-3 ranked for this product (critique: pre-mortem, assumption test, smaller version,
audience, core loop, ...; brainstorm: what if, reversal, SCAMPER, role play, journey gaps, ...).
Each round asks 4-6 questions anchored in your product.md and backlog, plus concrete starting
points; a summary follows, then another technique or the finish. Critique ends with edits to
product.md and the backlog, Brainstorm with a pick list of new items (next or ideas); both
apply through Update, so nothing changes without your OK.

### /setup

Make a project kit-ready. Idempotent: running it again only fills gaps.

It detects one of five situations:

| Situation                                                       | What happens                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Not in a project (home or chat folder, or a folder of projects) | **New folder**: asks the name, creates the folder (from home or a chat folder under `~/Projects`) + `git init`, moves the session there; send `/setup` again |
| Empty folder, no docs/product.md                                | **Product first**: runs the `/product` interview, then scaffolds                                                                                             |
| Empty folder, `docs/product.md` exists                          | **Scaffold**: runs the stack's official generator, adds a test runner, starts the app once (dev server, or a native app's window), then onboards             |
| A v1 project (`.project/`, not migrated or interrupted)         | **Migrate** (below)                                                                                                                                          |
| Any other existing code                                         | **Onboard**                                                                                                                                                  |

**Onboard** reads the manifest, scripts, test/lint config and recent git history, then:

- writes `AGENTS.md` from the template, with only verified facts (no placeholders);
- moves useful content from an existing `CLAUDE.md` into `AGENTS.md` and removes the `CLAUDE.md`
  after you confirm (otherwise `AGENTS.md` wouldn't load); a `CLAUDE.md` in a parent folder is
  only reported;
- creates `docs/decisions.md` with its format header (never overwrites) and fills `AGENTS.md § Backlog`;
- makes sure `AGENTS.md` and `docs/` are not in `.gitignore`, and ignores `.claude/worktrees/`;
- asks the git mode and prepares parallel sessions (`.worktreeinclude`, `autoPort`, database line).

**Migrate (v1 → kit)** moves the durable parts of v1's state and leaves `.project/` untouched so
you can delete it when satisfied:

| v1 source                                        | kit destination                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Generated `CLAUDE.md`                            | real rules/runbooks/pitfalls → `AGENTS.md`; template sections dropped |
| `AGENTS.md` symlinked to `CLAUDE.md`             | replaced by a real file                                               |
| `.project/project-seed.md`                       | `docs/product.md`                                                     |
| `.project/backlog.json` (open, board order)      | the backlog named in `AGENTS.md § Backlog`; cancelled items stay out  |
| `.project/conventions.md`                        | project rules → `AGENTS.md § Conventions`                             |
| `.project/project-context.json` learnings        | ≤ ~15 non-derivable ones → root or nested `AGENTS.md`                 |

You get a preview and one confirmation before anything is written. A run that stops halfway
leaves a `migrating from v1` line in `docs/decisions.md`, so the next `/setup` picks it up.
`/setup` never commits; it offers `/commit`.

### /task-readiness

The core skill prepares a multi-step, vague or risky task: it states the goal,
checks assumptions and tools, chooses a check per criterion, records pre-existing
failures and agrees on approval points. When all is clear it starts immediately.
It chooses how to work, checks the result and asks the fresh-context verifier to
assess the criteria. Human-only checks remain pending.

Use `/task-readiness <task>` to start or `/task-readiness <slug>` to resume a
spec in `docs/specs/`. Work spanning chats keeps a spec; small
obvious edits need no skill. GPT gives reviews and second plans; on Claude Pro it also
takes research and builds (see Delegation). Commit only
when requested or allowed by the flow note.

### /commit

Safe staging and a clean message. Called when you request a commit or the flow note allows it.

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
   commit. A failed pre-commit hook → fix and make a **new** commit
   (never amend after a failure); `--no-verify` only if you choose it.
6. **Push**: only when you asked in the same request or say yes now. The push itself goes
   through the [push-guard](#push-guard).

### /convert

Figma frame → UI code in your stack, checked against the frame in the browser, and editable in
your Payload CMS when the project has one.

```
/convert <figma-url | exported-frame.png> [target file or route]
```

The Figma MCP reads the frame per section (structure, design context, variables, screenshot),
plus Code Connect mappings (reuse existing components), motion data and a mobile frame when
there is one. Without the MCP an exported frame PNG works, but its values are estimates.

**Fidelity**: 1:1, each value mapped to the nearest existing token. Motion only as Figma defines
it (variants, prototype interactions), verified by computed values; extra animation is a
separate `/task-readiness` item.

**Steps**: find tokens (none → `/theme` first, or a small set as CSS variables) → **a plan you approve**
with sections, reused components, a figma → token mapping table, motion, assets, the mobile
layout and (Payload) a CMS table → build (flex/grid, semantic HTML, real copy, exported assets)
→ **verify loop** (max 3 rounds: screenshot vs frame, console errors, computed values, motion)
→ check at 390 / 768 / 1440 px → you approve the final screenshot.

**Payload projects** (`references/payload.md`): every text, image, link and list item becomes a
field the editor can change; existing blocks with a new variant come first, design-only sections
go in the project's own config, not a shared core. Follows the project's "add a section"
recipe in `AGENTS.md`. Migrations and seeding are asked first and never overwrite a page that
already lives in the CMS; where `AGENTS.md` forbids them (e.g. in a worktree) they become a
manual step. You get a manual check: read the page in `/admin` with the client role.

An existing target file is treated as a **patch**: everything the frame doesn't show (data
fetching, props, handlers, real copy) is kept. Standalone it ends with `/commit`; within a larger task it supplies the UI work.

### /theme

One source of truth for colors, type, spacing, radii, shadows and motion, written in the
project's own idiom so `/convert`, `/task-readiness` and the frontend rule use tokens instead of raw values.

```
/theme "calm, trustworthy, B2B"     from a brief (+ the product's audience)
/theme ~/Desktop/moodboard.png      from an image
/theme https://example.com          from a live site (computed styles)
/theme from-code                    consolidate raw hex/px values already in the code
```

1. **Detect** existing tokens (Tailwind v4 `@theme`, `tailwind.config`, `:root` variables, a
   theme file). Found → update mode.
2. **Propose for your approval**: semantic color roles (`bg`, `surface`, `fg`, `muted`, `border`,
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
/improve task-readiness "the baseline was not reported"
/improve commit            (uses the Skill Feedback points raised earlier in the chat)
```

1. **Locate** the kit repo (the plugin folder if it's a git repo, else `~/Projects/claude-kit`)
   and read only that skill, its references/scripts and the budget rules.
2. **Diagnose** each observation down to the line that caused it, and classify it: wrong
   default, ambiguous line, missing failure path, over-strict rule, duplicate of a native
   feature, hand-done deterministic work (→ script), or a new capability (pushed back on first).
   No causing line → it's probably model behaviour; no edit for a one-off.
3. **Propose for your approval** as before → after snippets with the line delta per file. Deleting
   and replacing beat adding; net growth needs a one-sentence reason; budgets still hold.
4. **Check**: budgets, `claude plugin validate`, the push-guard test when hooks changed, a real
   run of a touched script.
5. **Commit** in the kit repo as `fix(<skill>)` or `refactor(<skill>)`; to use it, start a new session or run `/reload-plugins`.

Together with the Skill Feedback rule in your global instructions this is the loop: friction
is noticed during a run → raised after the report and saved in `~/.agents/kit/feedback.md` →
you approve → `/improve` applies it and ticks the line off.

### /codex

Hands a task to a GPT model through the Codex CLI, so it runs on your ChatGPT plan instead of
Claude's limits. Claude uses it when you ask for GPT (Sol, Terra, Luna, Astra, e.g. "vraag Sol
wat hij van dit plan vindt") and for reviews and second plans; you can also call it yourself.

```
/codex Sol: review the current diff
```

The usual way is the mod's tool `mcp__kit__delegate` (see Delegation under [kit mod](#kit-mod)):
it picks the model, runs Codex and returns only its final message and the changed files.
Without the tool (in Codex itself, or an older kit) the skill runs `codex exec` by hand, with
the models from `scripts/codex-status.js`. GPT models are named by family and the newest version
in Codex's own catalog is used, so a new release (Terra 6.1, say) is picked up without a kit
update. Needed per device: the Codex CLI installed and `codex login` done once, with ChatGPT.
kit checks this by itself: it looks for Codex in the usual install places (Homebrew, npm, bun, the
ChatGPT and Codex apps), not only on the PATH, and of several installs uses the newest version
(Codex lists only the models its version knows, so an outdated CLI does not hide new ones; the
app's version may be a pre-release); tells apart "not installed" from "not logged in" in a toast and
in `/gpt`; and looks again every 30 seconds until Codex is ready, so installing it mid-session
needs no restart.

### /agy

Hands a task to a Gemini model through the Antigravity CLI (`agy`), the same way `/codex` does
for GPT. Claude recognises "Gemini", "agy" and "Antigravity" like the GPT names ("vraag Gemini
wat hij hiervan vindt"); "GPT en Gemini" runs both blind on the same brief and compares them.
Runs read-only (`--mode plan`) unless you asked for an implementation. It uses no `mcp__kit__`
tool for the hand route; with the kit mod `mcp__kit__delegate` runs it (`provider: "gemini"`): only the response and the changed files come back, a Gemini review counts as another family's review in flow, and a writing role asks first. Unasked it only
stands in for GPT (see **Delegation** below); its meters show in the band but weigh nothing.

### /launch

The step from "done on my branch" to "live", for solo and team work.

```
/launch               detect the release model and take the current work live
/launch minor         versioned projects: force the version bump
```

1. **Detect** the release model. _Continuous_ (a host such as Vercel or Netlify deploys the
   default branch): going live = merging to the default branch. _Versioned_ (`v*` tags, a
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
5. **Go live**: changelog + version commit (versioned), the merge (`Land: pr` → PR + squash
   merge, `Land: merge` → a direct merge into the default branch), push, and a tag on the
   merged commit: `vX.Y.Z`, or `release-YYYY-MM-DD` as a rollback anchor for continuous
   deploys. No remote yet → it offers to create a private GitHub repo.
   Never publishes to a package registry without a separate OK.
6. **After**: checks that the production URL (from `AGENTS.md`) answers once the host deployed.
7. **Clean up**: deletes the merged branch, and lists other worktrees whose branch is merged and
   clean, offering to archive those sessions (the app asks you per session). Merged through a PR
   with _Auto-archive after PR merge or close_ on, the current worktree session archives itself.

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
which groups to fix now (the small safe ones are recommended); the rest becomes backlog items
after your confirmation. The report can be saved as `docs/audits/<date>.md` to show a client what was
checked. With a `docs/seo.md` it also checks each planned SEO page: its main term in title or
h1, the page in the sitemap, its schema types.

### /scan

Measures how findable a live site is. It never fixes or plans anything.

```
/scan https://prospect.nl   outside a kit project: a free one-page check for a prospect
/scan                       in a kit project: this month's measurement in docs/seo.md
```

A script (`scripts/seo-facts.js`) collects the technique: robots.txt, every sitemap, and per
page the status, title, description, noindex, canonical, h1 and JSON-LD types. Then search data
(a Search Console export or a connected SEO tool; never an estimate), the Google Business
Profile (looked up in Google Maps, address included), and an AI check: three prompts a customer
would type, run in Perplexity in the browser (ChatGPT by hand, it needs a login), and whether the
business was named. A prospect gets `seo-scan-<domain>-<date>.md`: what works, the three
biggest opportunities (what is missing, not how to fix it), and what a plan would deliver. A
measurement is compared with the previous one; up to two points go on the backlog.

### /intake

The questions only the client can answer, asked once: what earns money, who buys, which words
they use, what they hear on the phone, which proof they have, and access to Search Console,
Analytics and the Business Profile. It reads the site and 2-3 competitors first, so every
question is specific and none asks what is already known (max 12). You get a ready-to-send
message; `/intake` again with the answers records them in `docs/seo.md`. A monthly `/scan` or a
new `/seo` run never repeats it.

### /seo

Turns the intake into a page plan. Candidate terms come from the intake, the site and the
competitors; volumes from a connected SEO tool or a CSV you export (Keyword Planner or Search
Console), otherwise `unknown`: it never makes up a number. Terms are grouped by intent into one
page each (no page per place name without real work there), each with the questions it answers,
its schema types and its links. `docs/seo.md` gets the keyword table and the page plan; new
pages and rework go on the backlog after one confirmation, for `/task-readiness`. Rerun it quarterly: it
starts from the pages closest to page one.

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
order (with `path:line` and _why_ it's written that way), names 1-2 ways it could break, then
asks 2-3 multiple-choice questions to check understanding, re-explaining a part when an answer
is wrong.

### /distill-skill

Turn a task you just finished and verified into a lean skill a cheaper model can follow. It
first fixes the scope (one repeatable task), keeps only what the next run would get wrong
without, drafts the skill under 60 lines, and proposes four test prompts (normal, exception,
missing information, out of reach). Only runs when you ask.

### lessons (Claude-only)

Not in the `/` menu; Claude invokes it at the end of `/task-readiness`, `/convert` and fixes, or whenever
it learns something worth keeping. It writes a lesson only when it is **not derivable** from the
code, **changes what the next session does**, and was **actually observed** (a bug, a failed
attempt, your correction). Zero lessons is the normal outcome.

- Module-specific → `<dir>/AGENTS.md` (created if needed; ≤40 lines)
- Project-wide → root `AGENTS.md` under Pitfalls/Conventions (root stays ≤100 lines)
- A decision with a rejected alternative, or one replacing an older one → `docs/decisions.md`
  (created if missing; the old entry gets `Superseded by:`)

It merges with existing lines instead of appending duplicates, and prunes lines that became false
or derivable.

This replaces v1's learnings system (JSON store, load/write scripts, extractor agent): Claude
Code itself loads the right `AGENTS.md` at the right moment.

---

## The verifier agent

`agents/verifier.md` runs on **Sonnet** in a fresh context, so it judges the code without the
builder's assumptions. `/task-readiness` gives it the criteria, changed files and baseline.

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

`PreToolUse` on Bash. Any `git push` (also `git -C dir push`, chained commands) needs your OK, except a plain push in auto mode:

| Permission mode              | What happens                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| default / acceptEdits / plan | the normal permission prompt appears                                                                                               |
| auto                         | a plain push goes through (auto mode's own checks still apply); a force push (`-f`, `--force`, `--force-with-lease`) still asks    |
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

**Context** (reads the spec selected by the latest explicit `/task-readiness <slug>` or expanded kit
task-readiness command, falling back to the current `feat/<slug>` or `fix/<slug>` branch):

- **Before native compaction** (auto, `/compact`, plugin or precompute), it adds preservation
  priorities: the current request and user corrections, decisions and reasons, failed attempts,
  test evidence, blockers, next steps and developments since the spec's last `Handoff`. Explicit
  `/compact <instructions>` take priority. It does not prune history or call a second summarizer.
- **After a compaction** (auto or `/compact`) it adds one line to the new context: slug,
  `Status`, criteria done, and "re-read the spec, `## Handoff` first". That line comes from
  disk, not from the summary. A spec with `Status: done` is ignored: no priority line and no
  note. Missing specs do not block compaction; subagents are left alone.
  Precompute receives the same priorities but appends no recovery note until compaction applies.
- **Pins**: `/pin <text>` pins your own text, `/pin last` pins Claude's last answer. After
  every main-chat compaction (not precompute, not subagents) all pins of the chat are appended
  word for word, from disk, so they do not depend on the summary. `/pin list`,
  `/pin remove <n>`, `/pin clear`; typed during a turn, `/pin` runs when it ends. At most
  12,000 characters per chat (they cost context each time); text that does not fit is refused,
  never cut. Per chat: `/clear` or a fork starts without pins, resuming finds them again. Pins
  of a chat with no message, pin change or compaction for 30 days are removed when another chat
  pins something, or at the first message of a new run or chat.
- **Latest messages**: after every main-chat compaction your latest messages (at most 5, 8,000
  characters in all, newest first to fit) are appended word for word, marked as already sent so
  an old request or approval is not acted on again. A message over 4,000 characters keeps its
  first 3,000 and last 1,000, and says how much is left out. Not repeated when compaction kept
  the message itself. Noted as you send it (terminal, desktop app, Remote Control, SDK host),
  without the blocks the app puts on their own lines around it (`system-reminder`, selected
  element, annotation, artifact view). Not noted: tool results, the app's events and
  notifications, commands without arguments, answers on a question card, and a prompt kit held (plan limit, model switch) and
  sent itself. A prompt queued during a turn counts once queued, also if you then take it back.
  After a message could not be saved, the note says the list may be behind (kept across a
  restart once a later message was saved). A copy is kept in the plugin's store for the 20
  latest chats; one idle for 30 days is never restored, and is removed at the first message of
  a new run or of a new chat. `/clear` starts empty.
- **Diagnostics**: the debug log records `kit compact:` with native token counts before/after,
  summarizer usage and duration when available. A reused precomputed summary may have no usage.
  These figures measure the integration, not summary quality or guaranteed dollar savings.
- **Auto-compact when the chat sits idle**: when a turn ends (not held by flow, no background
  work, no prompt queued behind it) and the context is at or above half the window (capped at
  160k tokens), kit runs `/compact` after the chat sat idle, with a toast saying why: 3 minutes
  after a turn that closed every task, so a follow-up question still finds the full context;
  10 minutes while work waits on you (an open flow task, a question). Not within 3 turns of the
  last compaction, not while the plan-limit pause holds; a prompt you send, typing in the
  prompt box or a turn that starts first cancels it. A compaction Claude Code skips is said in
  a toast and starts no cooldown.
- **The readiness block survives**: flow keeps the newest readiness block (task-readiness's
  `Goal:` … `Open:`, bold labels too) written in a turn of the open task on the task itself (a
  block shown before your go-ahead goes to the task that the next turn opens). After any
  compaction it comes back word for word, once; a new task starts without one, so an earlier
  task's block never returns.
- **Your last reply survives**: after every main-chat compaction the assistant's last reply
  (with the questions of a question card) comes back word for word as the very last note,
  marked as finished, still running, or already answered; over 4,000 characters it keeps its
  first 3,000 and last 1,000. Not repeated when compaction kept it; carried over by the next one.
- **Every note on its own**: each note (recent messages, readiness, spec, flow task, pins, last
  reply) is built apart; one that can't be read leaves the copy an earlier compaction kept and
  is named, the others still come back. A read note replaces its earlier copy, so none stack
  up. A `/task-readiness` command quoted in any kit note never selects a spec. A store kit can't
  read is never taken as empty: flow keeps its task and writes nothing over other chats'.
- **You see what came back**: a toast after each main-chat compaction (`kit: compacted 320k →
  28k · restored …`), with what was shortened or unreadable. Every completed compaction (native,
  yours or kit's) goes into a per-project ledger of the last 50 (tokens before/after, who
  started it, what was restored). `/kitcompact status` shows the state, the threshold and the latest rows;
  `/kitcompact off|on` per project (`/autocompact` is Claude Code's own command). A compact that fails turns it off until `/clear`.
- **The band** above the prompt, one line: usage at the left (see **Usage** below); at the
  right the context figure, then the model with its effort, then the profile and the limit
  button. The context figure opens a menu in its own block above the band (hover
  to peek, press to keep it open): **Compact** and **Clear**, run at once or when the
  running turn ends. The other buttons are switches a press cycles, none depending on
  another:
  - **Profile**: `◔` → `◑` → `●` (Lean, Balanced, Quality) → `○` dim (off). Beside it
    the model and effort kit set for the last prompt (`Opus 5.5 · medium`), which can differ
    from the session setting in the app's model picker.
  - **Effort**, only with the profile off (you pick the model in the app's picker):
    `‹ high ›`, a press on `‹` or `›` one level down or up (`default`, the session's own,
    then low to max); it holds over new chats and restarts. The engine lowers a level the
    model lacks.
  - **Limit**: `⏸ Off` (no pause, no pings; the default) → `⏸♨ Warm` (keep the cache warm
    while idle; `♨×3` after it counts the pings) → `⏸ Limit` (pause at the plan limit, the
    cache warm while work is open); see Keep warm. Kept per chat, over a reload or restart; a
    new chat starts at `⏸ Off`.
- **Model and effort**: the profile is **Lean**, **Balanced** or **Quality** (the band's profile button cycles them,
  or `/mode lean|balanced|quality|off`). The choice is kept across sessions. Each prompt is sorted (kit's own skills by name, the rest by a Haiku
  classifier) into question, routine, planning or heavy work, and the profile maps that to a
  model and effort. A short
  reply that is not a question (`ja`, `doe maar`, 30 characters or fewer) keeps the kind of the
  work before it, so it never drops to low in the middle of a build:

  ```
  Pro       Lean             Balanced          Quality
  question  Sonnet · low     Sonnet · low      Sonnet · medium
  routine   Sonnet · medium  Sonnet · medium   Opus   · high
  planning  Opus   · high    Opus   · high     Opus   · high
  heavy     Opus   · high    Opus   · xhigh    Opus   · xhigh

  Max       Lean             Balanced          Quality
  question  Sonnet · low     Sonnet · low      Sonnet · medium
  routine   Sonnet · medium  Opus   · medium   Opus   · high
  planning  Opus   · high    Opus   · high     Fable  · high
  heavy     Opus   · xhigh   Fable  · high     Fable  · xhigh
  ```

  The **Claude plan** bounds the models: kit reads it from the login (`organizationType` in
  `~/.claude.json`, or in `CLAUDE_CONFIG_DIR`; read again each new chat), or you set it with
  `/mode plan auto|pro|max`. That field is no official format, so anything but a Max login
  counts as Pro. On Pro kit never picks Fable (there it runs on paid usage credits). On Max
  Fable counts against up to half the weekly limit, and kit can't see how much of that is left:
  with usage credits on, work past it is billed.

  The first prompt of a chat (a new session or after `/clear`, not a resume) picks the model
  before it is sent: when it differs from the session's, you are asked to switch or stay (a switch sends every request to that model; the model picker keeps
  showing the old one, the band shows the real one with the effort, e.g. `Opus 5.5 · medium`; picking another
  model with `/model` ends the switch; a switch is kept per session over a restart). Every
  prompt sets the effort, unless one is locked. The model is never switched without asking: a later prompt that
  needs a stronger one runs one tier short (Sonnet for Opus work) at xhigh (Haiku: high, since
  Haiku's xhigh can end a turn with no answer; never max, which costs up to 3 times xhigh for no
  better coding). Two or more short you pick: a subagent on the stronger model for the hard part
  (the chat keeps its model, context and cache; the choice holds for the chat),
  switch now (only below 30% context, since a switch reads the whole chat again without the
  cache; otherwise compact, then switch), clear and then switch (the prompt is sent again), or
  stay at that effort (not asked again in that chat). Subagents get their own: `Explore` as question work, `kit:verifier` as planning work
  (a review: effort high, its model is its own), other built-in agents classified on their
  task. An explicit `model` or `effort` on the Agent call is kept.

- **Plan limit pause**: only while the limit button reads `⏸ Limit` for this chat.
  When the 5-hour limit nears 100%, the chat pauses before
  its next model request. The pause point is 95%, lower when the percentage climbs fast
  between two readings (other chats and agents count too: the figure is account-wide), and
  2 points stay free. While paused, prompts and skill or prompt commands are kept and
  replayed in order at the reset; commands run as commands. Local commands keep working.
  A built-in that already ran is not replayed; kit says its existing effects stand.
  Attachments are not kept, and the hold message says so. A person's prompt is replayed as
  their words; notifications and peer messages keep a plugin frame. A kept prompt that starts
  with `/` without being a command (a path) gets a `Kept prompt:` line before it, since a
  plugin may not send it as it stands.
  The band shows `paused until 14:05`, and **Resume now** ends the pause by hand.
  A dropped or rejected replay stays kept with the items behind it; kit reports the reason
  and count. **Resume now** or `/limit resume` retries them without waiting on the replay.
  `/clear` or `/resume` drops the old chat's kept prompts and says how many were dropped; a
  command already on its way is refused when it arrives, a plain prompt already on its way may
  still enter. A forked command (`/code-review`) that the pause cuts is kept and run again.
  A built-in prompt command kit does not know is not kept, and the hold message says so.
  A cut command kit cannot identify is not kept, and a toast says so.
  `/limit [status|off|warm|pause|resume]` replies in text, also during a running turn and on
  clients without the band. Empty or `status` shows Off, Warm or Limit, the pause time and
  kept count. `off`, `warm` and `pause` set the button; `pause` selects Limit (pause near the
  5-hour limit, not immediately). `resume` ends a pause or retries kept prompts.
  The prompt cache is kept warm meanwhile (see Keep warm), only when the reset is under
  5 hours away: further out, a cold start is cheaper. At the reset a cut-off turn continues
  by itself, ahead of the kept prompts.
- **Flow**: the change workflow, for every request and without `/task-readiness`. Each change task gets
  a track, from a Haiku classifier that judges the change's risk (not the model it needs):

  ```
  light   a small local change: make it, run a check that covers it
  medium  a bounded behaviour change: 2-4 criteria in the chat, test first, the checks
          that cover it (the full suite when shared code changed)
  heavy   a new capability, a shared interface, a migration or unclear scope:
          task-readiness, checks, a review and, by tier, a verifier; commit or push only when authorized
  ```

  One note goes out at the start and when the task grows, never on every prompt. It grows by
  what the work shows (more than 3 code files → medium; more than 8, or a migration or schema
  path → heavy) and never shrinks within a task. A short reply ("ja"), a question, or your
  answer to the question the last turn ended on keeps the task; a new change request folds into
  unverified work, which stays open until verified or waived. Code
  changed outside any task (an edit, a shell command, a subagent) starts a light one. No
  backlog needed.

  **The verify gate**: a turn that ends with changed code (not docs) is held until a passing
  check ran on the code as it is now. Flow judges by what it sees itself: git's fingerprint
  of the code's contents (so edits through the shell, a subagent or GPT count too, and a commit
  changes nothing), compared with the
  one the last passing check started on; without git, the order of the edits and checks.
  Only real runs count (a test, typecheck, lint or build command, not `echo test`); a failing
  check wipes earlier evidence; a piped check (`npm test | tail`) passes only when its output
  names no failure. V2 and V3 work also needs a review: at V2 a fresh Claude reviewer counts
  whoever wrote the code, GPT or Gemini only on code they did not solely write; at V3 only
  another family than the writer (naming failure paths). No Claude review displaces another
  family's fail on the same code. The `kit:verifier`'s PASS on that code, read from its own answer, is needed
  by tier: always at V3; on heavy work only when no real test run passed on the code (lint or
  build alone, or a failure that was already there) or no reviewer could run; and after a
  verifier reported failures, until it passes. It holds at most once per round of changes and twice per request, never when the turn ends on a question to you or you said to
  skip verifying ("skip the checks", "zonder te testen"; "stop" alone is a request); after
  that the task stays open until verified or you say "skip verify" to waive it. The open task
  is kept per session (a reload or restart keeps it), and after a compaction a note says what it still needs.

  Flow is always on: there is no switch. `/flow` reports 14 days: tasks per first pick, how many grew after it (too light?) or ended
  heavy with two files or fewer and no spec (too heavy?), holds, how tasks ended (
  verified, waived, and older unresolved or unverified endings), the median context at a task's
  first edit, first passing check and end (whether compacting mid-task would pay), and the last ten picks and holds, numbered.
  It also shows the open task and what it still needs, and counts the subagent spawns of those
  14 days (the newest 2000) by type and the model each ran on, resumed runs apart.
  `/flow mark 3 too-light` (or `too-heavy`, `hold-right`, `hold-wrong`) adds your judgment, which counts
  alone can't give. Flow stays off the band; `/flow` shows its tasks.

  **Task systems**: next to the track, every typed prompt gets a level per system, from the
  same classifiers plus one for what it needs verified (cosmetic, behaviour, shared code,
  risky: migration, auth, data loss), shown in the band as `D1 E1 V1`:

  ```
  Define   D0 answer directly   D1 goal, bounds, testable outcome   D2 read the code first,
           a second plan from GPT at a real fork (also planning and heavy work)
           D3 two blind proposals, Sol and Astra
  Execute  E0 here (a one-line tweak, an answer)   E1 here, with its covering check (default)
           E2 here in steps, each checked   E3 stuck or large: a blind second plan from GPT
  Verify   V0 the answer's sources   V1 a covering check or a visual look
           V2 + a review (a fresh Claude one counts without GPT room)
           V3 adversarial, by another family: failure paths, integration
  Refactor R0 (this increment always)
  ```

  One note says the levels, the next step and the evidence. On Claude Max the work stays here
  and the note names `mcp__kit__delegate` only where another model family, or a wide read by a
  Claude subagent, adds something. On Claude Pro, while ChatGPT shares the work (see
  Delegation), D2 sends research to `mcp__kit__delegate` and E1/E2 a change with its covering
  check to `mcp__kit__run_task`. No note for all-zero levels or a short reply (it keeps the open
  task's levels). "Met z'n drieën", "laat sol en astra meedenken" or "council" sets D3 for that
  prompt; without room for an Astra run (about 18 points of GPT's 5h window) it stays D2, with
  the reason in the note. Verify is never lowered. The task growing or its first failing check
  raises E and V by one, so repeated trouble ends at a second plan from GPT (E3). Each decision
  is logged with both 5h meters; `/flow` shows the counts per level and how many E1+
  decisions saw a GPT run before the next one.

- **Delegation**: where `mcp__kit__delegate` runs a piece of work follows the Claude plan
  (`/mode plan`). Max has room, so GPT only adds what Claude can't give itself; on Pro both
  subscriptions share the work:

  ```
  role        Claude Max                    Claude Pro, ChatGPT has its share
  search      Claude Sonnet (Explore)       GPT Luna
  research    Claude Sonnet (subagent)      GPT Sol
  build       this chat                     GPT Terra
  build+      this chat                     GPT Sol
  review      GPT Sol of Claude's code (Astra for a V3 task); of GPT's code, or without
              GPT room below V3: a fresh Claude reviewer (Fable on Max, Opus on Pro)
  plan        GPT Sol: a blind second plan
  GPT cannot  review and plan: Gemini, while its switch is on
  any, named  the GPT model you ask for
  ```

  On Pro ChatGPT has its share while the run keeps its 5h window at 70% or less, its week at
  75% or less (the rest is kept for reviews), and its week is at most 10 points further ahead
  of the time gone by than Claude's; otherwise the Max column applies.

  **ChatGPT's limits**: a run kit picks itself starts only when it fits: about 5 points of the
  5h window for a Sol read, 18 for Astra, and neither window past 95% (a window past its reset
  counts as empty; the meters are read from Codex at most every 10 minutes and again after each
  run). No room, no Codex or GPT off: a review or second plan goes to Gemini (see **Gemini
  stands in**); without it a second plan is made here, a review goes to the Claude reviewer and
  a V3 review stays open until another family can run or you waive it. A model you name runs
  anyway. **GPT off** (in the rings' table or `/gpt off`) reads nothing from Codex and hides its
  meters; a GPT model you name still runs. While GPT is on, a GPT run may write without asking
  (that switch is the standing request); with it off, a write asks first. A GPT run returns its final message, the files it changed
  and a `thread` for a follow-up without a new brief (checked against the limits too, unless
  you named the model); its whole log stays in Codex's session file. Writing runs one at a
  time, commit nothing, and Claude reviews the diff and runs the checks. A Claude route comes
  back as "run this as an Agent subagent on model X".

- **Gemini stands in**: while the Gemini switch is on (the default; the rings' table or
  `/gemini off`), a review or second plan GPT cannot take runs read-only on Gemini through
  `agy`, so that code goes to Google without a question (a review sends the whole uncommitted
  diff, also parts the brief does not name); the answer says it stood in and why.
  Not when you asked for GPT (a model or `provider: "gpt"`), for a follow-up on a thread, or for
  a review of code Gemini wrote in this chat's open task (after `/clear` or in another chat kit
  no longer knows the author: pass `author`, or switch Gemini off). Without `agy`, or when Gemini gives no answer, everything stays
  as above. A Gemini verdict never replaces a GPT fail on unchanged code.
- **Task runner**: for a change GPT builds (on Pro by itself, on Max when you ask).
  `mcp__kit__run_task` takes one change brief, a model only when you asked for GPT (the one you
  named, else Sol), and 1-3 covering checks (each an argv, e.g.
  `["claude", "plugin", "test", "."]`), runs GPT's build once, then runs the checks itself at
  the session root (no shell, 10 minutes each). A failing check goes back to the same Codex
  thread with its argv and last 60 output lines, and all checks run again: at most 2 fix
  rounds, 30 minutes in all. Every round starts only while ChatGPT's limits have room (about 5
  points of the 5h window, 20 for a large Sol build, 25 for Astra), named model or not, since
  a run cut off leaves half a change. The chat gets one short result: `pass`, `failing` (with
  the tail, never reported as passing), `stopped` (a Codex error, a check that can't start or
  times out, the deadline, no room for the next round) or `not run` (Max without a named
  model, no Codex, no room, another writing GPT run: the lock is delegate's). The check results are the mod's
  own reading, and flow counts them like a Bash check. Its checks run as you, outside Codex's
  sandbox, so every call asks permission and shows the argv. It leaves the diff review (and at
  V2+ the review) to the chat.

- **/gemini**: Gemini's review model and meters; `/gemini on` and `/gemini off` set its switch.
- **/gpt**: the newest model per family and the ChatGPT meters; `/gpt on` and `/gpt off` set
  the GPT switch. `/gpt pin terra gpt-5.6-terra`
  holds a family on a version (a new release that disappoints); `/gpt unpin terra` lets go.
- **Keep warm**: keeps a chat's prompt cache alive while it waits. After 50 idle minutes (the
  cache lives an hour) a tiny request, a fork of the chat that replies "ok", reads the cached
  context again and so renews it. The band's limit button decides when:
  - `⏸ Limit`: only while work is open: a plan-limit pause (when the reset is under
    5 hours away), or a turn that ended with background work still running (subagents,
    shells, workflows) or a wake-up or `/loop` still to come. A turn that ends with nothing
    open stops it.
  - `⏸♨ Warm` (or `/warm`, `/warm on|off`): also whenever the chat is idle, for a chat whose
    context you want to keep; it stops after 24 hours without a turn.
  - `⏸ Off` (default for every new chat): never.

  Each ping costs a cache read of the whole context (0.05× the input price on Opus 5.5)
  where a rebuild costs a cache write (2× for the 1-hour cache), so warm is cheaper when you
  return within about 33 hours; pings count toward your limits. A failed ping stops it
  (`⏸♨ Warm` drops back to `⏸ Off`). A ping only goes out in the cache's last 10 minutes:
  after a sleep (or any gap past the hour) the cache is already cold and a ping would pay the
  full rebuild, so none is sent until the chat runs again. The 24 hours count from your last
  turn, sleep included; a ping's own turn does not reset them.

- **`/band`** draws the band above the prompt again; folded (`[+]`)? `ctrl+x ctrl+a` unfolds it.
- **Usage** at the band's left: the 5-hour and 7-day limits, updated after every turn. On a
  terminal as text: `5h 55%·2% 2h53m`, Claude's share, ChatGPT's dim beside it and Claude's
  time until reset. In the desktop app (and wherever the app draws pictures) as one ring per
  window, 5-hour then week, each with three arcs in the plan's colour: Claude outside, ChatGPT
  between, Gemini inside. Beside a ring stands only Claude's time until reset (`5h –` or
  `wk –` while there is none); pointing at the rings shows all three plans in figures, with
  the **GPT** and **Gemini** switches (`on` /
  `off`, kept across chats; in a terminal `/gpt` and `/gemini`). Gemini's come from `agy --print=/usage` (no model
  run, no tokens), read at most every 10 minutes while the rings are drawn; without agy or a
  reading its arc stays empty.

**Theme pane** (docked on the right in the Desktop Code tab and a fullscreen terminal ≥ 110
columns, above the prompt otherwise):

- **Theme**: `/theme` shows its proposal before you approve it: colors for light and dark
  with contrast ratios, a sample card and button, the type scale in the real fonts, spacing,
  radius and shadow. Google Fonts are fetched as a small glyph subset and embedded (needs
  network and Node 18+); offline the system font is used. The terminal gets swatches and
  text. Contrast is computed by the mod and returned to Claude, which fixes failing pairs.

`/theme` passes its data to its pane as a tool call (`mcp__kit__theme_view`): display-only and
allowed without a prompt.

Trunk mode or no matching spec → the context part shows nothing. To turn every mod off, set
`"disableAllHooks": true` (this also stops push-guard and format-on-save).

---

## Git, branches and parallel sessions

`AGENTS.md` records the project's Git conventions. Use separate app worktrees for
parallel tasks when appropriate; keep uncommitted work and shared dependencies in
mind. Ask before pushing unless the session has already authorized it.

### Plain chats (no skill)

Small changes in a normal chat still get most of kit, because it lives in files and hooks rather
than in skills:

| Still applies                                                     | How                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Project rules, dev-server and database rules, merge-conflict rule | root `AGENTS.md` (loads every session)                      |
| Module pitfalls                                                   | nested `AGENTS.md`, when Claude reads files there           |
| Frontend habits                                                   | `rules/frontend.md`, when Claude reads a frontend file      |
| No unasked pushes, formatting                                     | the push-guard and format-on-save hooks                     |
| Branch first in `branches` mode                                   | `/commit` offers a branch when you're on the default branch |

What a plain chat skips on purpose: specs, claims and the independent verify. That's fine for
small changes; use `/task-readiness` once it's a feature.

## Common flows, step by step

| Situation                 | Flow                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| New idea                  | `/setup <idea>` (folder, interview, scaffold) → `/task-readiness <task>`                   |
| Existing repo, no kit yet | `/setup` → `/product` → `/task-readiness <slug>`                                           |
| v1 project                | `/setup` (migrate) → check the backlog → `/task-readiness <slug>`                          |
| Interrupted work          | new chat → `/task-readiness <slug>`                                                        |
| Bug in a finished feature | `/task-readiness "fix: …"` → reproduce, fix and verify                                     |
| Small tweak               | just ask in chat, then `/commit`                                                           |
| Several things at once    | one desktop session per task, each with the **worktree** option; `/task-readiness` in each |
| Go live / release         | `/launch` (checks, notes, merge or version tag)                                            |
| Before delivering a site  | `/audit` → fix the small things → `/launch`                                                |
| Free check for a prospect | `/scan <url>` outside a project → send the one-page report                                 |
| SEO for a client          | `/scan` → `/intake` (once) → `/seo` → `/task-readiness` per page → `/audit` → `/launch`    |
| Monthly SEO               | `/scan` → `/task-readiness` the points it adds; `/seo` again each quarter                  |
| Understand what was built | `/explain` (last change), `/explain <slug>` or `/explain <file>`                           |
| New idea mid-project      | `/product add <idea>`; verifier notes are also offered as backlog items                    |
| Rethink the plan          | `/product critique`                                                                        |
| Design → code             | `/convert <source>`, or put the source in a spec's `Design:` and `/task-readiness`         |
| Visual foundation         | `/theme` before the first UI work, or `/theme from-code` to clean up                       |
| A kit skill annoyed you   | `/improve <skill> "what happened"`                                                         |
| Commit stray work         | `/commit`                                                                                  |

**Example:** `/task-readiness habit-crud` resumes the spec, checks the goal and
baseline, then works toward the criteria and reports verification evidence.

---

## What Claude loads, and when

| When                            | What                                                     | Cost             |
| ------------------------------- | -------------------------------------------------------- | ---------------- |
| Every session                   | kit's skill/agent descriptions                           | ~200 tokens      |
| Every session                   | `~/.claude/CLAUDE.md` and the project's root `AGENTS.md` | your files       |
| Claude reads a file in `src/x/` | `src/x/AGENTS.md`                                        | only then        |
| You run a skill                 | that skill's `SKILL.md` (~0.4k–1.6k tokens)              | only then        |
| `/task-readiness` spec          | `references/spec-template.md`                            | only when needed |
| `/task-readiness` verify        | the verifier runs in its own context                     | not in your chat |
| A skill needs project state     | the relevant `docs/` file                                | on demand        |

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

**`/task-readiness` isn't found.** Run `claude plugin details kit`; in an open session run
`/reload-plugins`. If another skill uses the bare name, use `/kit:task-readiness`.

**A push was denied.** That's the push-guard in bypass mode. Say "yes, push" in chat; Claude
re-runs it with `KIT_PUSH_OK=1`.

**The verifier says "manual" for something it could test.** It's instructed to automate when in
doubt; a manual item should only cover credentials, perception, devices or audio. Answer it,
then add the test as a backlog item if it matters.

**A spec and the code disagree after a crash.** `/task-readiness <slug>` compares the spec with
`git status` on resume and tells you what it found. Correct the spec's `Status` by hand if needed.
It's just markdown.

---

## Evals

kit ships an eval suite (`evals/`) for `claude plugin eval`. Each case builds a tiny repo with
a fixture script, sends one prompt to a fresh, isolated `claude -p` session with only kit loaded,
and grades what happened: files written, tools called, the order of calls, text in the reply.

| Case                                 | What it guards                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `task-readiness-ready-block`         | readiness fields or the all-clear line appear                                                                       |
| `task-readiness-preexisting-failure` | an existing failure is reported and left untouched                                                                  |
| `commit-blocks-env`                  | `staging-check.js` runs and a `.env` file never ends up in the commit                                               |
| `commit-no-push`                     | `/commit` commits but never pushes on its own                                                                       |
| `setup-migrates-v1`                  | the v1 migration keeps real items/lessons and drops v1-only ones (judged by a model)                                |
| `setup-empty-folder`                 | an empty folder runs the `/product` interview instead of stopping; nothing is written or scaffolded before approval |
| `setup-new-folder`                   | in a folder of projects, setup makes a new project folder and hands off, writes no docs there                       |
| `lessons-nested`                     | a module-specific lesson lands in that module's `AGENTS.md`                                                         |
| `seo-no-invented-volumes`            | without a tool or CSV every volume stays `unknown`; no number is made up                                            |
| `intake-already-done`                | an answered intake is never asked again; it points to `/seo`                                                        |

Runs are non-interactive: nobody answers questions or approves plans. So the suite tests the
**decisions and safety rules** of the skills, not complete interactive flows.

**How Claude uses it.** `/improve` runs the evals of the skill it changes before and after the
edit, and refuses to commit when a score drops. Before fixing a behaviour bug it first writes a
regression case that fails, so every real piece of friction becomes a permanent test.

**Running it yourself**

```bash
cd ~/Projects/claude-kit
# cheap: one run per case, no baseline (~1 agent run per case)
claude plugin eval . --trust-plugin --scaffold --allow-tools Bash Write Edit \
  --runs 1 --ablation none --no-publish --threshold 0 --max-cost-usd 3
# full: 3 runs per case + a no-plugin baseline, to see what kit adds (Δ)
claude plugin eval . --trust-plugin --scaffold --allow-tools Bash Write Edit \
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
skills/task-readiness/references/   spec-template.md (loaded on demand)
skills/commit/scripts/            staging-check.js
skills/setup/scripts/             migrate-v1.js, detect-tools.js (+ .test.cjs)
skills/scan/scripts/              seo-facts.js, seo-facts.test.cjs
agents/verifier.md
hooks/hooks.json, push-guard.cjs, push-guard.test.cjs, format-on-save.cjs
rules/frontend.md                 user rule, symlinked into ~/.claude/rules/
AGENTS.md                         rules for working on this repo
```

Rules (also in `AGENTS.md`):

- **Budgets**: `SKILL.md` ≤ 150 lines (`task-readiness` ≤ 110), max 2 files in `references/`. Check with
  `wc -l skills/*/SKILL.md`.
- **No `shared/` folder and no state files.** Skills share files in the target project, and
  each file documents its own format in its header. Changing a format means changing the
  template in the skill that owns that file.
- **Scripts only for deterministic checks or conversions** (Node, cross-platform), referenced as
  `${CLAUDE_SKILL_DIR}/scripts/…` and listed in the skill's `allowed-tools` so they run without
  a permission prompt. Never for reading or editing spec files.
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

Then run the skill on a sandbox project in a new session (a local-folder install reads the
repo), or with `claude --plugin-dir ~/Projects/claude-kit`.

The scripts can also be run by hand: `node skills/commit/scripts/staging-check.js` in any repo,
`node skills/setup/scripts/migrate-v1.js <project>` on a v1 project (read-only), and
`node skills/setup/scripts/detect-tools.js <project>` to see which Test/Lint/Build/Security/Quality commands /setup would write.
