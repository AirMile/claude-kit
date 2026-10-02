<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# worktree-build

Status: defined
Design: —

## Goal

On the desktop, the roadmap pane can start a feature's `/build` in a new worktree session
(one chip click), so features build in parallel. The pane marks features already sent or
running elsewhere, so the same feature isn't started twice. Proven possible by the
`spawn-test` mod: `$.mcp.call("ccd_session", "spawn_task", …)` raises the chip.

## Acceptance criteria

- [ ] Happy: on the desktop an open card shows two buttons: `▶` builds here (clears the chat,
      as `↗` does today) and `↗` raises a "Build <slug>" worktree chip whose prompt is
      `/kit:build <slug>`; after `↗` the card shows a dim "sent to worktree" line.
- [ ] Happy: once another branch has a commit touching `docs/specs/<slug>.md` (the claim
      `/build` commits), the open card shows "runs on <branch>" instead, in any session and
      after a reload.
- [ ] Edge: `↗` on a card that is sent or running arms "Again?"; a second press within 4s
      raises another chip, one press alone does nothing. A "sent" mark with no claim after
      1 hour is dropped (chip dismissed or never started).
- [ ] Edge: in the terminal (no `ccd_session`) and in a draft pane there is no `↗`; `▶` and ⋯
      work as before.
- [ ] Error: `spawn_task` answers `isError` or throws → toast "kit: worktree chip failed
      (<reason>)", and the card gets no mark.

## Out of scope

- Resuming an in-progress (spec on this branch) feature in a worktree.
- Merging worktree branches or `docs/roadmap.md` conflicts (`/launch` and build step 7.6).
- Starting the session without the chip click (the API has no call for that).

## Approach

- `hooks/roadmap-worktree.ts` (new, view stays ≤ ~300 lines): `claims(gitOutput)` pure parser
  of `git log --all --source --name-only --format=%S -- docs/specs` → `{ slug: branch }`,
  skipping the current branch; `readAway($, root, branch)` merges claims with `$.store` marks
  (`worktree` → `{ [root]: { [slug]: sentAt } }`, expired after 1h) into
  `{ slug: "sent to worktree" | "runs on <branch>" }`; `spawn($, root, slug)` marks first,
  calls `spawn_task`, unmarks + throws on failure.
- `hooks/roadmap-parts.tsx`: `Parts.away: Record<string,string>`, `Parts.canWorktree`,
  `Actions.worktree(slug)`.
- `hooks/roadmap-card.tsx`: open card buttons `▶` (act.build) + `↗` (act.worktree, via
  `act.confirm` when `away[slug]`), dim `away` line under the description.
- `hooks/roadmap-view.tsx`: load `away` with the other git facts; `canWorktree =
e.surface === "desktop" && !draft`; `act.worktree` → spawn, toast on error, reload.
- `AGENTS.md`: mod read-list gains "spec claims on other branches" and the `$.store` mark;
  `README.md` button legend if it names `↗`. `plugin.json` → 0.3.4.

```
╭──────────────────────────────────────╮
│ dark-mode                            │
│ Toggle between themes     ▶  ↗  ⋯    │
│ runs on claude/great-hypatia-58a9b2  │  (dim)
╰──────────────────────────────────────╯
```

## Tests

- `hooks/roadmap-worktree.test.ts`: `claims` parsing (other branch, current branch skipped,
  remote refs, empty) and mark expiry → criteria 2, 3.
- `claude plugin validate .`, `claude plugin test .`, `node hooks/push-guard.test.cjs`.
- Desktop by hand (verifier can't press pane buttons in the app): criteria 1, 3, 5 and that
  the chip's `/kit:build <slug>` prompt runs the skill; terminal check for criterion 4.

## Handoff

Branch `feat/worktree-build`. User picked: `$.store` mark + git claim; `↗` (today's in-chat
icon) becomes the worktree button, in-chat gets `▶`. kit repo has no docs/roadmap.md, so no
roadmap line. Test mod `spawn-test` lives in ~/.claude/dev-mods (not in repo).

## Verify

## Fixes
