---
name: build
description: Build a feature or fix a bug end to end (spec → build → verify → commit). Use with /build.
argument-hint: '[slug | "what to change or fix"]'
---

# Build

For features and real bugs. It keeps progress in `docs/specs/<slug>.md` so any new chat can
resume with `/build <slug>`. No checkpoints or background workflows: the spec file is the state.
Small changes don't need this skill (a plain request + `/commit` is fine); `/build` handles them
gracefully when it gets one anyway.

**Phase boundaries**: before every `Status:` change, rewrite the spec's `## Handoff` (template
rule). A fresh chat gets nothing else back, so anything learned only in this chat goes there.

## 0. Workspace

- **Git mode** from `AGENTS.md § Git`: `branches` (default when missing) or `trunk`.
- `branches` and on the default branch → before the first edit of a Feature or Fix,
  `git switch -c feat/<slug>` (or `fix/<slug>`). Already on another branch (e.g. a desktop
  worktree session) → stay on it.
- Fresh worktree (dependencies missing, e.g. no `node_modules/`) → run the install command from
  `AGENTS.md § Git` first.
- Never create a worktree yourself (the desktop app wouldn't manage it: no PR panel, sync or
  auto-archive). Parallel work = a new desktop session with the **worktree** option.

## 1. Resolve

Read `docs/roadmap.md` (if any). A slug can be in progress on another branch (a parallel
session or a teammate): `git fetch -q` (when there is a remote), then **claimed** =
`git log --all --oneline -1 -- docs/specs/<slug>.md` prints a commit not on the current branch.
No argument → skip claimed slugs. A claimed slug named explicitly → say which branch has it;
checked out in another worktree → continue in that session; otherwise offer to switch to it.
Then:

| Input                                                            | Path                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A slug with `docs/specs/<slug>.md`                               | **Resume** (below)                                                                                                    |
| A slug on the roadmap, no spec                                   | **Feature**                                                                                                           |
| No arg                                                           | Roadmap item in progress (spec link, unchecked) → Resume; else first open item → Feature. No roadmap → ask what to do |
| Free text describing a bug ("fix", "broken", "error", "doesn't") | **Fix**                                                                                                               |
| Free text, other                                                 | Size gate → **Small** or **Feature**                                                                                  |

**Resume**: read the spec's `Status`, `## Handoff` and unchecked criteria, run `git status`/
`git diff --stat`, and compare with the spec's Approach. Say in one line where you pick up, then
continue at the step matching the status (`defined`/`building`→4b, `verifying`→5, `manual`→6).

**Size gate**: the change is Small only when **none** hold:

1. Net-new surface: adds a capability (new page, route, endpoint, model, migration).
2. More than 3 source files (lockfiles/generated excluded).
3. Needs a new test file or harness (new cases in an existing test file are fine).
4. Touches a shared layer/interface used by more than 2 modules, or a cross-cutting rename.

Re-check while working: the moment real scope crosses a criterion, stop, tell the user, and
switch to Feature (write a spec for what's left).

## 2. Small

1. Make the change. Run the scoped tests/lint for the touched files.
2. UI change → screenshot check in the browser (see Verify for the browser rules).
3. `lessons` if something non-obvious came up.
4. `commit` (normal mode; no spec, no roadmap edit unless a roadmap item was just completed).

## 3. Fix

Read `${CLAUDE_SKILL_DIR}/references/debug.md` and follow it. It ends with a commit.

## 4. Feature

### 4a. Define (plan mode)

1. `EnterPlanMode`. Read `docs/product.md` (non-goals!), `docs/decisions.md`, the roadmap line, and
   the code the feature touches. Ask only what you can't answer from those: one question at a
   time, or one AskUserQuestion with concrete options for a real design fork (recommended first).
   Usually 0-3 questions.
2. Draft the spec in the plan file using
   `${CLAUDE_SKILL_DIR}/references/spec-template.md`: criteria per happy/edge/error,
   Approach with files, ASCII wireframe for UI, Tests mapping. More than 6 criteria → propose a
   split first. Also check: does this make another roadmap item obsolete? Say so in the plan.
3. `ExitPlanMode`. Reject → revise. Accept →
   - write the plan text as `docs/specs/<slug>.md` (`Status: defined`); no slug yet → derive one
     and add a roadmap line (in the first phase that still has open items);
   - add `· spec: docs/specs/<slug>.md` to the roadmap line;
   - a decision with a rejected alternative → append to `docs/decisions.md`;
   - commit just these docs right away (`docs(<slug>): add spec`): that commit is the claim
     other sessions see, and the resume point if this chat dies. With a remote, the plan says
     the branch will be pushed so teammates see the claim; accepting it is the OK, so push
     (`KIT_PUSH_OK=1 git push -u origin HEAD`).
4. Safe point (the cleanest one): AskUserQuestion: Continue here (Recommended when this chat is
   short) / Fresh start (`/clear`, then `/build <slug>`: drops the exploration, keeps the spec)
   / Build, then stop (before verify) / Stop here (spec only; `/build <slug>` builds it later).
   Fresh → call `mcp__kit__fresh_start` with the slug (the mod clears the chat after this turn
   and resumes there); tool missing → tell the user to run `/clear`, then `/build <slug>`. End
   the turn. Never offer it from step 5 on: Finish needs what happened in this chat.

### 4b. Build (inline)

1. `Status: building`. Spec has `Design:` → follow the `convert` skill's procedure for that UI.
2. Per criterion: write or extend the test first when it's testable, then the code. Follow
   `AGENTS.md` conventions. Library API you're unsure of → context7, don't guess.
3. Run the full test suite + typecheck/lint once at the end. Fix until green.
4. Don't check criteria yet: verify does that.
5. User chose Build, then stop → `Status: verifying` (Handoff: what verify should look at
   first), report, end the turn. Changes stay uncommitted: Finish makes the one commit.

## 5. Verify

`Status: verifying`. Spawn the plugin's `verifier` agent (fresh context, it did not build this)
with: the spec path, the dev server URL (rule below), and the list of changed files.
It returns: per-criterion pass/fail with evidence, manual items, and at most 3 improvement notes.

- Fails → fix them (inline), re-run the failing checks yourself. Max 2 rounds; still failing →
  stop, write the state into `## Verify`, report what blocks, and leave `Status: verifying`.
- All automated criteria pass → check them `[x]` in the spec, record the result and the
  verifier's improvement notes under `## Verify`.

Dev server: follow `AGENTS.md § Git` (only a server this session started; default port taken
→ free port, app URL variables pointed at it). Pass its URL to the verifier. Stop only
processes you started; never `pkill` by name.

## 6. Manual

Only for items the verifier could not automate (real credentials, perception like "feels
smooth", physical device, audio). `Status: manual`. For each: show steps + expected result, then
AskUserQuestion: Pass / Fail (describe) / Skip. Fail → treat as a Fix (tier 2 of debug.md) within
this feature, then re-ask that item. Record outcomes under `## Verify`.

## 7. Finish

1. `Status: done`; all criteria `[x]`; roadmap line → `[x]`. Was it the last open item of its
   phase (`##` heading but Later) → that phase is done: the report's `phase` line (suggest,
   don't ask). A `vX` heading suggests `/launch major`, `vX.Y` `/launch minor`.
2. Verifier improvement notes (from `## Verify`) → append each as a line under `## Later` in the
   roadmap, without asking (the user prunes later; `## Later` is never picked up by `/build`).
   Skip duplicates.
3. `lessons`.
4. Suggest in the report, don't ask: `/simplify` when the diff is over ~150 lines;
   `/security-review` when the feature handles auth, user input stored server-side, or payments.
5. `commit feature=<slug>` → one commit with code + spec + roadmap. On a feature branch the
   commit skill offers push + PR; going live is `/launch`. Never push here.
6. Merge conflicts in `docs/roadmap.md`, `docs/decisions.md` or `AGENTS.md` when syncing with
   the default branch → keep both sides' lines (parallel sessions each add their own).

## Report

```
BUILD · <slug> · <small | fix | feature>
criteria   <n>/<n> verified (<k> manual)
tests      <pass count> · <suite command>
later      +<n> ideas added under ## Later (or —)
commit     <hash> <subject>
suggest    </simplify, /security-review, or —>
phase      <heading> done · /launch [major|minor], then /roadmap to sort ## Later (only when one ended)
next       <next open roadmap slug, or —>
```

Stopped early → same block with `status  blocked at <step>: <reason>` and how to resume
(`/build <slug>`).
