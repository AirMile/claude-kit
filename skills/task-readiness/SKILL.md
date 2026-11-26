---
name: task-readiness
description: Prepare and execute a code change: establish the goal, required tools, acceptance checks and approval points. Use before adding a capability, changing a shared interface, migrating data, or starting work with unclear scope or verification; also use to assess task readiness or resume a spec by slug (`/task-readiness SLUG`). Skip small, obvious local edits and routine bounded fixes with clear checks. For readiness-only requests, assess without implementing.
argument-hint: "[task or slug]"
---

# Task readiness

Make the goal and the infrastructure right, then let the model work: after the readiness block
the route is the model's call. Look in the repo first; ask only what it cannot tell you. kit's
flow (the mod) holds the turn's end until the checks of the latest code pass.

## 1. Goal

- Size it from the repo (files and lines it touches), not from the request's words. A size that
  contradicts the words (a "proof of concept" of a whole application) → say so, propose a slice.
- End result and how we know it is good: acceptance criteria (observable, never "code is
  clean"), an example if there is one, what is out of scope. Read `docs/product.md` non-goals and
  `docs/decisions.md`; a change that brings back a rejected alternative → say so first.
- List the assumptions the goal rests on; test each first or report it as untested. An unknown
  the running app can answer (a timing, a count) → measure it, don't guess.
- Cannot state it → interview: one question at a time, the most blocking first, with a suggested
  answer, only questions whose answer changes the work. Stop when the goal fits in three lines
  and the user confirms. Never invent requirements to avoid asking.

## 2. Tools

List what the task needs beyond reading and editing files, search and the terminal: a browser,
a database, a test runner, another system, a port. Probe an uncertain capability with a small,
safe command. Per gap, propose the smallest fix: an existing CLI, a small script, an MCP server
the setup already approves. Install or configure nothing without approval.

## 3. Verification

One exact check per criterion, from `AGENTS.md § Commands` first (`Test`, `Lint / typecheck`,
`Build`, then `Security` and `Quality`): the command and what it is compared against.

- Run the existing checks once before the first edit. What already fails is **pre-existing**:
  list it, never fix it as part of this task. `Security`/`Quality` output now = the baseline;
  only new findings count.
- A new check must be seen failing on the wrong state (a bug: reproduce it first; a repro that
  passes before the fix proves nothing). A criterion with no check → build that check first.
- A green check proves only what it measures: green lint says nothing about failing tests. No
  pipes that hide an exit code (`npm test | tail`).
- No commands in `AGENTS.md` → say so and suggest `/setup` (it runs `detect-tools.js`).
- Only a human can judge it (looks, feel, a real device) → report it as pending until they have.
- Work outside the repo (a vault note, an external tool) → check it on that target; a review
  brief names those paths and excludes the repo's changes; a few lines of config need none.

## 4. Approval points

- Up front: the goal from check 1.
- During: stop only on real doubt, a disproved assumption, or effort beyond what was agreed.
- Always before irreversible steps: delete, push, deploy, migrate data, send messages.
- At the end: the evidence (check output), not just "done".

## Output

Reply with this block. Goal confirmed (by the request or the user) and Open is "none" → go on
at once; otherwise wait for the answer.

```
Goal:        <end result + how we know it is good>
Size:        <files, lines, what was measured>
Assumptions: <each: tested | untested>
Tools:       <ready | missing: X → proposed fix>
Verify:      <criterion → exact command (seen failing: yes | no) · pending human: …>
Baseline:    <failures that already exist, or "clean">
Approvals:   <where you will stop>
Open:        <questions left, or "none">
```

All four already clear from the request and the repo → one line instead, and start.

## Then work

`AGENTS.md § Git` says `branches` and you are on the default branch → `git switch -c
feat/<slug>` (or `fix/<slug>`) before the first edit; on another branch (a worktree session),
stay. Choose the approach yourself; for a real fork name two or three options and pick one with a
reason. Check as you go, not only at the end. Library API you are unsure of → context7.

- **Use GPT as the mod's notes say** (they follow the Claude plan: Pro shares research and
  builds with GPT, Max does them here). On both, ask `mcp__kit__delegate` role `review` or
  `plan` for a heavy task's review, a real design fork or after failed fixes (GPT when it has
  room); GPT for anything else only when a note or the user asks. Read its diff yourself.
- **Bugs:** reproduce first, state the cause as a hypothesis with what you expect to see, get
  that evidence cheaply (targeted log tagged `[DBG:<slug>]`, one screenshot), fix the proven
  cause. A failed fix needs new evidence before the next; never the same fix reworded. A
  regression with a known good commit → `git bisect run`. Done = the repro is green and every
  `DBG` line is gone.
- **Verify before you finish:** a heavy task gets a review (`mcp__kit__delegate` role
  `review`): P0/P1 findings are fails. A task that only deletes whole project folders needs no
  review unless a flow hold asks. Without GPT room a fresh Claude reviewer answers, which counts
  below V3; V3 without room → ask once: wait, or the exact words "skip verify" (fixed phrases
  only). `kit:verifier` (fresh context; criteria, changed files, baseline) is needed only at
  V3, without a test run passed on the final code, or without a reviewer. After a fix re-run
  the failing checks and the full suite; the flow's hold names what else reruns (a docs-only
  fix reopens nothing). A re-review covers only the fix diff, the verifier only the criteria
  it touched. A finding outside the agreed criteria → a noted limit, not another round.
- **A live peer session edits this checkout** (changed files you didn't write) → propose a
  worktree. Staying → edit only your own lines; checks on HEAD (`git worktree add --detach`)
  plus your files; no `run_task`; review only your paths; note it in the Handoff.
- A criterion or an out-of-scope line must change → stop, show the delta, ask once.

## Spec file (only for work that outlives this chat)

Work that spans chats keeps `docs/specs/<slug>.md`, naming its backlog item
([template](references/spec-template.md)): goal, criteria with their check, out of scope, a
rewritten Handoff. `/task-readiness <slug>` resumes from it: read `Status`, `Handoff`, the open
criteria and `git status`, say where you pick up. Move `Status` along (`defined` → `building`
→ `verifying` → `manual` → `done`) and rewrite Handoff at each change. A slug with a spec on
another branch (`git log --all --not HEAD --oneline -1 -- docs/specs/<slug>.md` prints a
commit) is in progress there: say which branch, don't restart it.

## Finish

Criteria `[x]` only once you or the verifier saw the check pass; `Status: done` only when all
are. A backlog item (`AGENTS.md § Backlog`): follow that section, complete it only on the
user's yes. A surprising lesson → the `lessons` skill. Commit (`commit` skill) only when the
user asks or the flow note allows it; never push without their OK. Versions: `/launch`.
