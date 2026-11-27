---
name: obsidian
description: Keep a project's human side in the user's Obsidian vault - the backlog note, notes for the user to read (explanations, handoffs, overviews) and the docs link that shows the repo's docs/ there. Use when the backlog in AGENTS.md § Backlog is an Obsidian note, when the user asks to put something in their vault or notes, to move a Todoist backlog to Obsidian, or when a session-start note reports a missing backlog note or docs link.
---

# Obsidian

The user reads in Obsidian, not in the IDE. Everything written for the user to read lives in or
shows up in the vault; everything the model or the mod reads stays in the repo.

## Where things go

The vault path comes from the user's instructions (`Notes Vault`). None named → ask once.

| What                                        | Lives in                                    | Shown in Obsidian by    |
| ------------------------------------------- | ------------------------------------------- | ----------------------- |
| Backlog                                     | `<vault>/Projects/<Name>/<Name> backlog.md` | the note itself         |
| Explanations, handoffs, overviews, canvases | `<vault>/Projects/<Name>/`                  | the note itself         |
| `docs/` (product, specs, decisions, seo)    | the repo                                    | the docs link           |
| `AGENTS.md`, lessons                        | the repo                                    | not shown: model-facing |

Never move `docs/` or `AGENTS.md` into the vault: the mod reads specs for the verify gate,
specs follow branches, and Claude Code and Codex load `AGENTS.md` only from the repo.

`<Name>` is the project name from `docs/product.md`'s title or the repo folder; an existing
`Projects/` folder for the same project wins over a new spelling.

## The docs link

`<vault>/Projects/<Name>/docs` links to `<repo>/docs`, so specs and product.md open in Obsidian
while staying in git. Create it only when `<repo>/docs` exists, the link does not, and the user
said yes to it (a yes to an Obsidian backlog counts):

- macOS/Linux: `ln -s "<repo>/docs" "<vault>/Projects/<Name>/docs"`
- Windows: `cmd /c mklink /J "<vault>\Projects\<Name>\docs" "<repo>\docs"` (a junction needs
  no admin rights)

A real folder named `docs` is already there → stop and ask; never replace it. Remove a link with
`rm` on the link path (Windows: `rmdir`), which leaves the repo's files alone. A worktree has its
own `docs/`: the link points at the main checkout only.

## The backlog note

`AGENTS.md § Backlog` names it by path, with `~` for the home folder:

```markdown
## Backlog

- The backlog is the Obsidian note `~/Documents/Vault/Projects/<Name>/<Name> backlog.md`
  (sections `Nu`, `Hierna`, `Ideeën`). Do not keep a list in the repo.
- Add items only after the user confirms; complete one only after the user confirms.
```

The note's format (section names follow the user's language):

```markdown
---
project: <Name>
repo: <absolute repo path>
---

# <Name> backlog

## Nu

- [ ] <item> · [[<spec slug>]]

## Hierna

- [ ] <item>

## Ideeën

- [ ] <item>
```

- One line per item, a `[[slug]]` link once it has a spec (it resolves through the docs link).
- Order inside a section = priority. Move an item between sections by moving its line.
- Done → `- [x]`, and move it to a `## Klaar` section at the bottom (kept, not deleted).
- Every add, move, rewording or completion waits for the user's confirmation, as with any
  backlog. Show the changed lines after writing.
- Read it with Read, edit it with Edit: it is a plain file. No Obsidian running needed.

## Moving from Todoist

When `§ Backlog` names a Todoist project and the user asks to move it:

1. Read the open tasks per section with the Todoist connector's tools.
2. Show the note as it would be written (sections mapped by name; unknown sections become their
   own heading) and ask once: write it. A backlog note already exists there → show what it
   already has and merge (add only missing lines); never overwrite it.
3. Yes → write the note, rewrite `§ Backlog` to the note's path, create the docs link, and
   replace a `todoist` query note in that project folder only on a separate yes.
4. Leave the Todoist project alone: archiving or deleting it is the user's step. Say so.

No Todoist connector (Codex) → say the move needs it and stop.

## Writing other notes

- Write a note only when the user asks for it; the backlog only by its confirmation rule; the
  docs link only on a yes. A session-start note about a missing note or link is a reason to
  offer, never to write.
- Obsidian conventions: `[[wiki links]]` between notes, YAML frontmatter between `---`, never
  touch `.obsidian/`, `Images/` or `.base` files, and follow the vault's own instructions file.
- A handoff note: `handoff-<date>-<slug>.md`. An explanation: a title the user would search for.
- Report every path written.

## Report

```
OBSIDIAN · <backlog | note | link | move>
written     <paths>
backlog     <n in Nu> · next: <first open item>
docs link   <ok | created | missing: reason>
```
