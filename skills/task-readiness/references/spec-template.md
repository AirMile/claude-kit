# Spec template

For work that outlives one chat or sits on the roadmap: `docs/specs/<slug>.md`. Keep it under
~50 lines; add a section only when it helps the next reader.

```markdown
<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# <slug>

Status: defined
Design: <Figma URL (or exported frame PNG), or —>

## Goal

<1-3 sentences: what changes for the user, and why>

## Acceptance criteria

- [ ] <observable behaviour> — check: `<command or browser step>`

## Out of scope

- <explicit non-goals>

## Handoff

<rewritten at every Status change, max 5 lines: what a fresh chat needs and the spec doesn't
say: deviations, what was tried and failed, user corrections, the next first step. `—` if none>

## Verify

<baseline failures, verifier result, manual items with steps + expected result, outcome>
```

Rules:

- Criteria are observable (a user or a test can see them), each with one exact check.
- **Handoff** is replaced, never appended.
- Optional when useful: `## Approach` (files, ASCII wireframe for UI) and `## Fixes`
  (`date · symptom · cause · fix`).
