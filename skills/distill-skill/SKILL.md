---
name: distill-skill
description: Turn a task that was just completed and verified in this session into a lean, reusable skill a cheaper model can follow. Use only when the user asks to distill or capture this session as a skill.
disable-model-invocation: true
argument-hint: "[what to distill]"
---

# Distill this session into a skill

Precondition: the task succeeded and was verified in this session. If not, say so and stop.
Distill what happened, not an ideal workflow.

## 0. Scope: decide what the skill is for, before extracting

A session holds more than the repeatable task. Name the task first:

```
This skill lets <model> do <one repeatable task>,
given <what exists at the start>, ending in <verifiable result>.
```

- List every repeatable task the session contained. One skill per task; more than one → ask which.
- Sort what happened into four piles. Only the first goes in the skill.
  1. the procedure the next run repeats
  2. one-time setup that now exists (tooling built, config fixed): refer to it by path, don't
     describe how it was made
  3. discoveries now settled in the code or docs: leave out, unless the next run can break them
     (then one "keep X" rule)
  4. the session itself: cost, plans, reviews, chat about tools
- Test every candidate line: would the next run go wrong without it? If not, drop it.

Show the one-sentence scope and the pile-1 outline. Wait for confirmation before step 1.

## 1. Extract

Within that scope only. In a long session extract from the files on disk (specs, diffs, scripts),
not from memory.

- the steps that led to the result (drop dead ends and retries)
- the judgment calls, each as "when X, do Y, because Z"
- the mistakes made first, each as "do X, not Y"
- the tools used and the exact verification check
- where the human had to decide, and where the work had to stop and be handed back

Leave out secrets and what is specific to this run. Keep what is constant for the project:
paths, ports, commands.

## 2. Write

Name the model and the tool the skill is for, and draft `<name>/SKILL.md` where that tool reads
it: `~/.claude/skills/<name>/` for a personal skill, `.claude/skills/<name>/` in the repository
for a project skill. Skill files are English.

- frontmatter: `name` and `description` (what it does and when to use it)
- under 60 lines, imperative, no background or history; snippets and lookup tables go in a
  `reference.md` beside it
- spell out the reasoning a cheaper model would not reach itself: decision rules, edge cases,
  one worked example when the format matters
- leave out what a capable model does right without being told
- state the stop conditions: when the cheaper model must hand back instead of continuing
- end with the verification check (exact commands, run without a pipe) and the approval points
- mark steps that are identical every time as `SCRIPT CANDIDATE`

Show the draft and wait for approval before writing the file.

## 3. Test plan

Propose four sample tasks to run in a fresh session on the cheaper model, each with a ready-to-
paste prompt, its expected result and how to verify it:

1. normal case
2. exception: an edge case this session hit, or a failing tool
3. missing information: the skill should ask, not guess
4. out of reach: the skill should stop and hand back, not push on

Compare with the same tasks run without the skill.

## 4. Iterate

The user reports results → fix only what failed, with the smallest change. A test that passes
without a line → delete that line. Once the tests pass, turn `SCRIPT CANDIDATE` steps into
`scripts/` files and replace each step with one line that calls its script.
