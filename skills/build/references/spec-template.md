# Spec template

Written by `build` at plan accept as `docs/specs/<slug>.md`. The approved plan text **is** this
file: copy it, don't re-author it. Keep it under ~80 lines.

```markdown
<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# <slug>

Status: defined
Design: <path or Figma URL, or —>

## Goal

<1-3 sentences: what changes for the user, and why>

## Acceptance criteria

- [ ] Happy: <observable behaviour>
- [ ] Edge: <empty / duplicate / boundary input → expected result>
- [ ] Error: <failure (invalid input, network, permission) → what the user sees>

## Out of scope

- <explicit non-goals for this feature>

## Approach

<files to add/change, one line each; key data shape; ASCII wireframe for UI>

## Tests

- <which test file(s) cover which criteria; what is checked in the browser>

## Handoff

<rewritten by build at every Status change, max 5 lines: deviations from Approach, what was
tried and failed, user corrections, what the next step does first>

## Verify

<filled by build: auto result, verifier notes, then manual items with steps + expected, then
outcome>

## Fixes

<filled later by build's fix path: date · symptom · cause · fix>
```

Rules:

- Criteria are observable (a user or a test can see them), never "code is clean".
- More than 6 criteria → propose splitting into two roadmap items before writing.
- Every criterion maps to at least one line under **Tests** (automated or browser).
- **Handoff** is replaced, never appended: only what a fresh chat needs and the spec doesn't
  already say. Nothing worth saying → `—`.
