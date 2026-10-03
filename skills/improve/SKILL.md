---
name: improve
description: Improve a kit skill from observed friction, within its budget. Use with /improve.
argument-hint: '<skill> ["observation"]'
disable-model-invocation: true
allowed-tools: Bash(claude plugin eval *)
---

# Improve

Turns friction seen while using a kit skill into a small, approved edit of that skill. The goal
is a better skill, not a bigger one: kit stays small only if every refinement pays for its lines.

## 0. Locate

- **Repo**: the current directory when it is a kit checkout (`.claude-plugin/plugin.json` with
  `"name": "kit"`, e.g. a worktree of it); else `~/Projects/claude-kit`; else ask. The installed
  plugin loads from the main checkout, so edits there go live in every project's next session.
- **Skill**: the first argument (`build`, `commit`, …, or `verifier` for the agent, `push-guard`
  / `format-on-save` for a hook). Missing → the skill with the most open inbox points; none →
  ask which one.
- **Observations**: the quoted argument, any Skill Feedback points raised earlier in this
  conversation for that skill, and its open inbox points (`mcp__kit__feedback` `list`). None →
  scan this chat's run of it (skipped/improvised steps, corrections, "Other" answers, avoidable
  questions, failed tool calls); still none → ask.

## 1. Read (only what this skill needs)

- The repo's `AGENTS.md` (budgets and rules).
- The skill's `SKILL.md`, its `references/` and `scripts/` (or the agent/hook file).
- Another skill only if an observation touches a shared file format (product/roadmap/spec/
  decisions headers) or a hand-off (`build` → `commit`, `build` → `convert`).

Note the current line count, then run the skill's **baseline evals**: the command in
`AGENTS.md § Evals` with `--tag <skill>`. Note each case's score. No cases for this skill → note
that; the suite grows through step 2b.

## 2. Diagnose each observation

Find the exact instruction (`path:line`) that caused it, then classify:

| Class                                                         | Typical fix                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong default / auto-decidable question                       | change the default or drop the question                                                                                               |
| Ambiguous instruction                                         | rewrite the line; don't add a paragraph                                                                                               |
| Missing failure path                                          | one line: condition → action                                                                                                          |
| Over-strict rule, or a rule nobody followed                   | cut or loosen it                                                                                                                      |
| Duplicates a native Claude Code feature                       | delete it and point to the feature                                                                                                    |
| Deterministic work done by hand (parsing, counting, checking) | a Node script in `scripts/`, called via `${CLAUDE_SKILL_DIR}` and added to `allowed-tools`                                            |
| Wants a new capability                                        | push back first: is it needed in more than one run? Does a native feature or another skill cover it? Only then add, and cut elsewhere |

Can't point to a causing line → say so; it may be model behaviour, not the skill. Don't edit
for a one-off.

## 2b. Reproduce as an eval (before fixing)

For each observation that shows up without a user in the loop (routing, files written, tools
called, safety rules), add a regression case `evals/<skill>-<what>/`: copy the closest existing
case, adapt `fixture.sh`, `prompt.md` and the graders, and prefer free graders (`regex`,
`tool_used`, `tool_order`, `file_exists`) over `llm`. Run it alone (`--case <name>`): it must
**fail** on the current skill, otherwise it doesn't capture the problem. Needs a human answer
to reproduce → skip and say so.

## 3. Propose (plan mode)

`EnterPlanMode`. For each observation: the cause (`path:line`), the class, and the change as a
before → after snippet. End with the line delta per file:

```
build/SKILL.md   120 → 118 (-2)
```

Rules for the proposal:

- Prefer replacing and deleting over adding. Net growth needs a reason in one sentence.
- Budget from `AGENTS.md` still holds after the change; over it → cut something in the same
  skill first.
- Changing a file format → update its header template in the owning skill and every reader.
- Keep skill files in English.

`ExitPlanMode`. Reject → revise. Accept → apply exactly the approved changes.

## 4. Check

Run what applies, all from the repo root:

- `wc -l skills/*/SKILL.md` (budgets)
- `claude plugin validate .`
- `node hooks/push-guard.test.cjs` when hooks changed
- a touched script: run it once on a realistic case
- the skill's evals again (same command): every case at least its baseline score, the new
  regression cases pass. A drop → revise the change, don't commit it.

Fail → fix before reporting.

## 5. Commit

In the repo: stage only the changed files and commit with `fix(<skill>): …` (behaviour that was
wrong) or `refactor(<skill>): …` (clearer or shorter, same behaviour). English, ≤ 72 chars. No
push unless the user asks.
Then close every inbox point this run acted on or declined (`mcp__kit__feedback` `done`).

## Report

```
IMPROVE · <skill>
changes   <n> (<classes>)
lines     <file> <before> → <after>
checks    budgets ✔ · validate ✔ · tests ✔
evals     <before> → <after> (<n> cases, +<k> new)
commit    <hash> <subject>
next      /reload-plugins to use it in this session
```

Observations that were not acted on: one line each with why (one-off, model behaviour, covered
elsewhere).
