---
name: product
description: Shape an idea into docs/product.md + a backlog, or update the backlog. Use with /product.
argument-hint: "[idea | add <item> | brainstorm | critique]"
---

# Product

Turns an idea into `docs/product.md` (what and why) and a backlog (ordered features) every
later step reads. When they exist, it updates them instead.

## The backlog

`AGENTS.md § Backlog` names where it lives (a Todoist project, an issue tracker) and its rules.
It is the only list: no copy in the repo, no `docs/roadmap.md`.

- Read and write it with that tool (Todoist: the connector's tools). Every write waits for the
  confirmation below.
- No `## Backlog` yet → ask once where it lives (Todoist project (Recommended with a Todoist
  connection) / another tracker / none), create the project only on that answer, and write the
  section (format below; none → the one line `- No backlog.`, so it isn't asked again). No
  `AGENTS.md` yet → note the answer for `/setup`.
- None, or unreachable (no connector, e.g. in Codex) → show the items in the chat and say they
  were not saved. Never create a file for them instead.
- Items added to Todoist, and the notes vault in the user's instructions has no view of them →
  offer `Projects/<Name>/<Name> taken.md` there with a `todoist` query block (shaped like an
  existing one); write it only on a yes.
- The repo has a `docs/roadmap.md` without a `moved to the backlog` line → offer to move its
  open lines and `## Later`, only those the backlog lacks. Only once all of them are in, add
  `<!-- moved to the backlog <date> -->` at its top. The file stays; delete it only on an
  explicit yes to deleting it, asked after the move and naming what goes with it (done items,
  spec links).

## 0. Route

- No git, no manifest, and cwd is `$HOME`, `/`, a folder of projects or the desktop app's
  throwaway chat folder → stop: `/setup <idea>` first (it asks the name and place).
- `docs/product.md` missing → **New**.
- Exists, no arg → list the open backlog items by section and stop: the user says what to change.
- Exists, arg starts with `critique` → **Critique**; `brainstorm` → **Brainstorm**.
- Exists otherwise → **Update** (arg = the change, e.g. `add dark mode`).

## New

1. **Intake.** Use the arg as the idea; empty → one open question: "Describe the idea: what is
   it, for whom, and what made you want it now?" Read any existing code/README for context.
2. **Approval.** The product + backlog draft is the artefact the user approves; write no file
   and no item before that.
3. **Rounds** (1-3, stop when enough): up to 4 parallel AskUserQuestion calls per round, options
   concrete to _this_ idea, recommended first. Round 1 covers: audience, MVP size, core experience
   (multiSelect), and stack (or "repo defaults" when code exists). Later rounds target gaps: key
   features, non-goals, risks. Rules:
   - Vision, tone and naming are open questions, never option sets.
   - Visual choices (layout, look) → show 2-3 ASCII/markdown mocks, don't ask blind.
   - Competing designs → print a short trade-off table before the question.
   - Two free-text answers in a row → switch to open questions.
4. **Draft** `docs/product.md` (format below) and the items, in order, in the chat, and ask:
   Accept / Revise. Revise → show again.
5. **Accept** → write `docs/product.md`, add the items to the backlog. Report and point to the
   next step.

### Item rules

- Items are user-visible capabilities, each buildable on its own in one `/task-readiness` run.
  Too big for ~6 acceptance criteria → split. Infra-only items only when a feature needs them.
- Order: dependencies first, then value. Greenfield → first item `scaffold` (handled by `/setup`).
- A short title (kebab-case slug, 1-3 words, unique) and one line of description.
- 5-15 items for an MVP. More ideas → the backlog's ideas or later section, outside the order.

## Update

1. Read product.md + the open items.
2. Apply the request: add (find the right place by dependency/value; say why), reorder, remove,
   or reword. Check the change against **Non-goals**: a conflict → say so and ask whether the
   non-goal changes (then update product.md too) or the item is dropped.
3. Never touch done items or items in progress: in the backlog's in-progress section, or with a
   spec on another branch (`git log --all --oneline -1 -- docs/specs/<slug>.md`).
4. Show the changes as a list, one confirmation (Apply (Recommended) / Adjust), write. It names
   every item that gets removed or completed.

## Critique

Stress-test product.md and the backlog through techniques (pre-mortem, assumption test, smaller
version, ...) applied one at a time in dialogue, then turn the findings into edits via
**Update**. Follow `references/critique.md`.

## Brainstorm

Find new features through techniques (what if, reversal, role play, ...) applied one at a time
in dialogue, then pick which land on the backlog via **Update**. Follow
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

`AGENTS.md § Backlog`:

```markdown
## Backlog

- The backlog is <the Todoist project `<name>` (sections `<in progress>`, `<next>`, `<ideas>`)>.
  Do not keep a list in the repo.
- Add items only after the user confirms; complete one only after the user confirms.
```

## Report

```
PRODUCT · <new | update | critique | brainstorm>
product.md  <created | updated | unchanged>
backlog     <n open> in <place | not saved> · next: <first open item>
next        /setup (no code yet) · /task-readiness <slug>
```

Offer `/commit`.
