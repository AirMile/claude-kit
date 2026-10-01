---
name: explain
description: Explain code or a change at the user's level, with check questions. Use with /explain.
argument-hint: "[nothing = last change | path or symbol | feature slug]"
---

# Explain

Helps the user understand their own code: what was built, how it works and why it is written that
way. It never changes code.

## 0. What to explain

| Argument                            | Material                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| none                                | uncommitted changes, else the last commit (`git show`)                       |
| a feature slug                      | `docs/specs/<slug>.md` (goal, criteria) + the commits that touched its files |
| a path or symbol                    | that file/function plus its direct callers and callees                       |
| a question ("how does login work?") | find the entry point and follow it                                           |

Large material (> ~400 changed lines) → explain the 2-3 most important parts and list the rest.

## 1. Level

Use `Explanation Level` from the user's instructions (default: intermediate).

- **Novice**: define every term the first time (one short clause), one everyday analogy at
  most per concept, small steps, no unexplained abbreviations.
- **Intermediate**: name patterns and trade-offs, skip basics.
- **Expert**: only the non-obvious: design choices, edge cases, risks.

## 2. Explain

1. **Big picture** (2-3 sentences): what problem this solves and the idea of the solution.
2. **Walk-through in execution order**, not file order: follow one realistic case (e.g. "user
   clicks Save") through the code. Each step: `path:line`, what happens, and **why** it is done
   this way when there was a choice.
3. **Where it could break**: 1-2 edge cases and what handles them (or doesn't).

Keep code quotes short (≤ 8 lines each). Prefer a small ASCII flow over long prose when data
moves between several parts.

## 3. Check understanding

Ask 2-3 questions, one at a time, with AskUserQuestion (3-4 options, one correct, wrong options
plausible). After each answer: say whether it's right and why in 1-2 sentences; a wrong answer
→ re-explain that one part differently, then move on.

Questions test understanding, not memory: "what happens if…", "why does this check come
before…", not "on which line…".

## 4. Close

Offer: go deeper into one part, explain a related piece, or stop. Write notes to a file only
when the user asks (to the Obsidian vault only on explicit request).
