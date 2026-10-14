---
name: product
description: Shape an idea into docs/product.md + a roadmap, or update the roadmap. Use with /product.
argument-hint: "[idea | add <item> | brainstorm | critique]"
---

# Product

Turns an idea into two files every later step reads: `docs/product.md` (what and why) and
`docs/roadmap.md` (ordered features = the backlog). When they exist, it updates them instead.

## 0. Route

- No git, no manifest, cwd is `$HOME`, `/` or a folder of projects → stop: `/setup` first.
- `docs/product.md` missing → **New**.
- Exists, no arg → **show** the roadmap live (below) and stop: the user edits in the pane, or
  says what to change. No pane (tool missing) → **Update** and ask what to change.
- Exists, arg starts with `critique` → **Critique**; `brainstorm` → **Brainstorm**.
- Exists otherwise → **Update** (arg = the change, e.g. `add dark mode`).

## New

1. **Intake.** Use the arg as the idea; empty → one open question: "Describe the idea: what is
   it, for whom, and what made you want it now?" Read any existing code/README for context.
2. **Plan mode.** Call `EnterPlanMode` before the first question; the product + roadmap draft is the
   artefact the user approves.
3. **Rounds** (1-3, stop when enough): up to 4 parallel AskUserQuestion calls per round, options
   concrete to _this_ idea, recommended first. Round 1 covers: audience, MVP size, core experience
   (multiSelect), and stack (or "repo defaults" when code exists). Later rounds target gaps: key
   features, non-goals, risks. Rules:
   - Vision, tone and naming are open questions, never option sets.
   - Visual choices (layout, look) → show 2-3 ASCII/markdown mocks, don't ask blind.
   - Competing designs → print a short trade-off table before the question.
   - Two free-text answers in a row → switch to open questions.
4. **Draft** both files (formats below) in the plan file, **show** the draft, and
   `ExitPlanMode`. Reject → revise (show again).
5. **Accept** → write `docs/product.md` and `docs/roadmap.md`, show it live. Report and point
   to next step.

### Roadmap rules

- Items are user-visible capabilities, each buildable on its own in one `/build` run.
  Too big for ~6 acceptance criteria → split. Infra-only items only when a feature needs them.
- Order: dependencies first, then value. Greenfield → first item `scaffold` (handled by `/setup`).
- Slugs: kebab-case, 1-3 words, unique.
- 5-15 items for an MVP. More ideas → put them under `## Later` (unordered, not in the flow).
- Phases are releases: group the items under `## v<version> · <name>`, starting with
  `v1 · MVP`, then `v1.1 · <name>` (1-4 open at a time). Order across and within = priority.
  Any other `##` heading but Later (`Phase 1 · MVP`, `Now`) or none at all stays valid.

## Update

1. Read product.md + roadmap.
2. Apply the request: add (find the right phase and position by dependency/value; say why), reorder,
   remove, or reword. Check the change against **Non-goals**: a conflict → say so and ask whether
   the non-goal changes (then update product.md too) or the item is dropped.
3. Never touch `[x]` lines or items that are in progress: a spec link here, or claimed on another
   branch (`git log --all --oneline -1 -- docs/specs/<slug>.md`). Reordering around them is fine.
4. Show the diff and **show** the resulting roadmap, one confirmation (Apply (Recommended) /
   Adjust), write.

**Show** = call `mcp__kit__roadmap_view`. A draft not yet written (New, Update before Apply):
pass the product name, the items in order (`state`: `done` for `[x]`, `progress` for a linked
unchecked line, else `open`; `phase`: its heading without `## `) and the `## Later` ideas.
After writing: call it without items; the pane then shows `docs/roadmap.md` live, where the
user can also add, reword, move or shelve open items. Tool missing → print it as a list:
per phase its heading and items (done, in progress, open), then `## Later`.

## Critique

Stress-test product.md and the roadmap through techniques (pre-mortem, assumption test, smaller
version, ...) applied one at a time in dialogue, then turn the findings into edits via
**Update**. Follow `references/critique.md`.

## Brainstorm

Find new features through techniques (what if, reversal, role play, ...) applied one at a time
in dialogue, then pick which land on the roadmap via **Update**. Follow
`references/brainstorm.md`.

## Formats

`docs/product.md`:

```markdown
<!-- format: product. Keep under ~60 lines. Product intent only, no implementation detail. -->

# <name>

**What:** <one paragraph>
**For whom:** <audience + their situation>
**Why now:** <problem it solves / trigger>

## Core experience

- <2-4 bullets: what must feel right>

## Non-goals

- <explicit exclusions>

## Stack

<framework, hosting, data; or "existing repo">

## Open questions

- <unresolved, if any>
```

`docs/roadmap.md`:

```markdown
<!-- format: items under phase (release) headings, one line per item, order = priority.
## v<version> · <name>
- [ ] **slug** · one-line description
- [ ] **slug** · description · spec: docs/specs/slug.md   ← in progress (spec exists, not done)
- [x] **slug** · description · spec: docs/specs/slug.md   ← done -->

# Roadmap

## v1 · MVP

- [ ] **scaffold** · project skeleton, dev server, test runner
- [ ] **<slug>** · <description>

## v1.1 · <name>

- [ ] **<slug>** · <description>

## Later

- <idea>
```

## Report

```
PRODUCT · <new | update | critique | brainstorm>
product.md  <created | updated | unchanged>
roadmap     <n open> · next: <first open slug>
next        /setup (no code yet) · /build <slug>
```

Offer `/commit`. Working in parallel → add items from inside the worktree session that will
build them: a new worktree may start from `origin/<default>` and miss unpushed roadmap edits.
