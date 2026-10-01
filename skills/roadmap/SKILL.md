---
name: roadmap
description: Shape an idea into docs/product.md + a roadmap, or update the roadmap. Use with /roadmap.
argument-hint: "[idea | add <item> | critique]"
---

# Roadmap

Turns an idea into two files every later step reads: `docs/product.md` (what and why) and
`docs/roadmap.md` (ordered features = the backlog). When they exist, it updates them instead.

## 0. Route

- `docs/product.md` missing → **New**.
- Exists, arg starts with `critique` → **Critique**.
- Exists otherwise → **Update** (arg = the change, e.g. `add dark mode`, or empty → ask what to change).

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
4. **Draft** both files (formats below) in the plan file and `ExitPlanMode`. Reject → revise.
5. **Accept** → write `docs/product.md` and `docs/roadmap.md`. Report and point to next step.

### Roadmap rules

- Items are user-visible capabilities, each buildable on its own in one `/build` run.
  Too big for ~6 acceptance criteria → split. Infra-only items only when a feature needs them.
- Order: dependencies first, then value. Greenfield → first item `scaffold` (handled by `/setup`).
- Slugs: kebab-case, 1-3 words, unique.
- 5-15 items for an MVP. More ideas → put them under `## Later` (unordered, not in the flow).

## Update

1. Read product.md + roadmap.
2. Apply the request: add (find the right position by dependency/value; say why), reorder,
   remove, or reword. Check the change against **Non-goals**: a conflict → say so and ask whether
   the non-goal changes (then update product.md too) or the item is dropped.
3. Never touch `[x]` lines or items that are in progress: a spec link here, or claimed on another
   branch (`git log --all --oneline -1 -- docs/specs/<slug>.md`). Reordering around them is fine.
4. Show the diff, one confirmation (Apply (Recommended) / Adjust), write.

## Critique

Stress-test product.md and the roadmap without editing it first. Three lenses, max 3 findings each, concrete:

1. **Assumptions**: what must be true for this to work, and which one is least proven?
2. **Failure modes**: how does the MVP disappoint its first real user?
3. **Smaller version**: what is the smallest roadmap that still tests the core idea?

Then offer: apply suggested roadmap/roadmap edits (via Update) or leave as is.

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
<!-- format: one line per item, order = priority.
- [ ] **slug** · one-line description
- [ ] **slug** · description · spec: docs/specs/slug.md   ← in progress (spec exists, not done)
- [x] **slug** · description · spec: docs/specs/slug.md   ← done -->

# Roadmap

- [ ] **scaffold** · project skeleton, dev server, test runner
- [ ] **<slug>** · <description>

## Later

- <idea>
```

## Report

```
ROADMAP · <new | update | critique>
product.md  <created | updated | unchanged>
roadmap     <n open> · next: <first open slug>
next        /setup (no code yet) · /build <slug>
```

Offer `/commit`. Working in parallel → add items from inside the worktree session that will
build them: a new worktree may start from `origin/<default>` and miss unpushed roadmap edits.
