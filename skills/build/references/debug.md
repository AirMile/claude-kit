# Fix path (debug ladder)

For a reported bug. The point: spend effort in proportion to how well the cause is understood,
and never guess the same fix twice.

## Pick the entry tier from what you can observe (not from confidence)

| Tier          | Signals                                                                                      | Do                                               |
| ------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1 Direct      | Symptom and cause both visible; a known value (CSS, copy, config, threshold); 1-2 files      | Change it, re-check live or re-run the one check |
| 2 Hypothesis  | Symptom clear, cause not proven; logic bug, unclear source of a wrong value, state-dependent | Hypothesis loop below                            |
| 3 Investigate | Spans modules, intermittent, concurrency/data you can't see, or a lower tier already failed  | Investigation below                              |

**Escalation rule (hard):** every failed fix moves up exactly one tier. Never retry at the same
tier without new evidence.

## Reproduce first (tier 2+)

Make the bug observable before editing: a failing test when the behaviour is testable, otherwise
a browser repro (steps + screenshot/console). The repro is the done-check at the end.

## Hypothesis loop (tier 2)

1. Write it down before touching code: "Cause is X; if so I'll see Y" (a log value, DOM state,
   network response, failing assertion).
2. Get Y with the cheapest instrument: targeted log, console, network tab, one screenshot.
3. Confirmed → fix the proven cause. Refuted → new hypothesis from what you saw. No new evidence
   → no new fix.
4. Repro passes. Remove the instrumentation.

Library API involved → check current docs (context7) before fixing.

## Investigation (tier 3)

Spawn one Explore subagent (`model: sonnet`) with: the symptom, the repro, what was tried and
why it failed, and the files suspected. Ask for: the causal chain with `path:line` evidence and
one recommended fix. Then present that fix as a short plan (plan mode) before applying it.

## Finish

- Repro green (test passes or user confirms live). "Should work now" is not done.
- Append to the feature's spec `## Fixes`: `YYYY-MM-DD · <symptom> · <cause> · <fix>`. No spec
  for this area → skip.
- The cause was non-obvious → `lessons`.
- `commit` with type `fix`.

## Anti-patterns

Guess-and-check · several changes at once · rewording a fix that already failed · treating a
plausible cause as proven · claiming fixed without a green check.
