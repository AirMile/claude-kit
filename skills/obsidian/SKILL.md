---
name: obsidian
description: Keep a project's human side in the user's Obsidian vault - notes for the user to read (explanations, handoffs, overviews), a view note on the Todoist backlog, and the docs link that shows the repo's docs/ there. Use when the user asks to put something in their vault or notes, to set up a project's vault folder, or when a session-start note reports a missing vault folder or docs link.
---

# Obsidian

The user reads in Obsidian, not in the IDE. What is written for the user to read lives in or
shows up in the vault; what the model or the mod reads stays in the repo. The backlog stays where
`AGENTS.md § Backlog` says (Todoist): the vault only shows it.

## Where things go

The vault path comes from the user's instructions (`Notes Vault`). None named → ask once.

| What                                        | Lives in                   | Shown in Obsidian by    |
| ------------------------------------------- | -------------------------- | ----------------------- |
| Explanations, handoffs, overviews, canvases | `<vault>/Projects/<Name>/` | the note itself         |
| Backlog                                     | Todoist (`§ Backlog`)      | the view note           |
| `docs/` (product, specs, decisions, seo)    | the repo                   | the docs link           |
| `AGENTS.md`, lessons                        | the repo                   | not shown: model-facing |

Never move `docs/` or `AGENTS.md` into the vault: the mod reads specs for the verify gate,
specs follow branches, and Claude Code and Codex load `AGENTS.md` only from the repo.

`<Name>` is the project name from `docs/product.md`'s title or the repo folder; an existing
`Projects/` folder for the same project wins over a new spelling. `AGENTS.md § Backlog` names
the folder, with `~` for the home folder, so the session-start check can find it:

```markdown
- Notes for the user: the Obsidian folder `~/Documents/Vault/Projects/<Name>` (its `docs`
  links to this repo's `docs/`).
```

That line is missing when you create the docs link or the view note → offer to add it in the
same step; without it the check stays silent for this repo. No `## Backlog` yet → write that
section per the `product` skill first, never a heading that holds only this line.

## The docs link

`<vault>/Projects/<Name>/docs` links to `<repo>/docs`, so specs and product.md open in Obsidian
while staying in git. Create it only when `<repo>/docs` exists, the link does not, and the user
said yes to it by name:

- macOS/Linux: `ln -s "<repo>/docs" "<vault>/Projects/<Name>/docs"`
- Windows: `cmd /c mklink /J "<vault>\Projects\<Name>\docs" "<repo>\docs"` (a junction needs
  no admin rights)

A real folder named `docs` is already there → stop and ask; never replace it. Remove a link with
`rm` on the link path (Windows: `rmdir`), which leaves the repo's files alone. A worktree has its
own `docs/`: the link points at the main checkout only.

## The Todoist view note

`<vault>/Projects/<Name>/<Name> taken.md` holds only a query block for the todoist-sync plugin,
so the backlog shows in Obsidian (shaped like an existing one):

````markdown
```todoist
name: "<Name>"
filter: "#<Todoist project>"
autorefresh: 300
groupBy: section
sorting:
  - order
```
````

Offer it when the folder has none; write it only on a yes. Never edit tasks through it: backlog
changes go through the Todoist connector, each after the user's confirmation.

## Writing notes

- Write a note only when the user asks for it; the view note and the docs link only on a yes.
  A session-start note about a missing folder or link is a reason to offer, never to write.
- A note with that name already exists → read it, add to it; never overwrite it.
- Obsidian conventions: `[[wiki links]]` between notes, YAML frontmatter between `---`, never
  touch `.obsidian/`, `Images/` or `.base` files, and follow the vault's own instructions file.
- A handoff note: `handoff-<date>-<slug>.md`. An explanation: a title the user would search for.
- Report every path written.

## Report

```
OBSIDIAN · <note | link | view | setup>
written     <paths>
docs link   <ok | created | missing: reason>
```
