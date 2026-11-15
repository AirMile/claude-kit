---
name: task-readiness
description: Check that a task is ready for an agent before it starts: a clear goal, the tools, an exact check per criterion, agreed approval points. Use before a multi-step, vague or risky task, or when asked whether a task is ready. Skip small, obvious edits.
argument-hint: "[the task]"
---

# Task readiness

Four checks before the work starts. Look in the repo first; ask the user only what it cannot
tell you. `/build` runs this in its Define step (4a) for Features, and its answer becomes the
spec's criteria and Tests.

## 1. Goal

- Size it before you state the goal: count the files and lines it touches and follow imports
  transitively. The size contradicts the request's own words (a "proof of concept" of a whole
  application) → say so and propose a slice.
- State the end result and how we know it is good: acceptance criteria, an example if there is
  one, what is out of scope.
- List the assumptions the goal rests on. Each is tested first or reported as untested.
- Cannot state it → interview: one question at a time, the most blocking first, with a suggested
  answer, only questions whose answer changes the work. Stop when the goal fits in three lines
  and the user confirms. Never invent requirements to avoid asking.

## 2. Tools

List what the task needs beyond reading and editing files, search and the terminal: a browser,
a database, a test runner, another system, a port. Probe an uncertain capability with a small,
safe command; check that the ports and services it needs are free or running, and whose they
are. Per gap, propose the smallest fix: an existing CLI, a small script, an MCP server the
user's setup already approves. Install or configure nothing without approval.

## 3. Verification

One exact check per acceptance criterion, taken from `AGENTS.md § Commands` first (`Test`,
`Lint / typecheck`, `Build`, then `Security` and `Quality` when set): the command, and what it is
compared against (a test, a screenshot, a diff against expected output).

- Run the existing checks once up front. One that already fails proves nothing: list it as
  pre-existing, never as a result of this task.
- A check counts only once it has been seen to fail on the current, wrong state, or its output
  has been read. A criterion with no check → building that check is the first step.
- `Security` or `Quality` set → note their output now as the baseline; only new findings count
  later.
- No commands in `AGENTS.md` → say so and suggest `/setup`, which fills them
  (`node ${CLAUDE_PLUGIN_ROOT}/skills/setup/scripts/detect-tools.js .` shows what it would add).
- Only a human can judge a criterion → say so and report it as pending until they have.

## 4. Approval points

- Up front: the goal from check 1.
- During the run: stop only on real doubt, a disproved assumption, or effort clearly beyond what
  was agreed.
- Always before irreversible steps: delete, push, deploy, migrate data, send messages.
- At the end: show the evidence (check output), not just "done".

## Output

Reply with this, then wait for the go:

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

All four are already clear from the request and the repo → say so in one line and start. Do not
interview for the sake of it. Called from `/build` 4a: do not wait for a go here; the spec draft
is the confirmation.
