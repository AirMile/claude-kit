#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src tests docs/specs
printf '# habits\n\nHabit tracker in plain JavaScript.\n\n## Commands\n\n- Test: `node --test`\n\n## Git\n\n- Mode: trunk\n' > AGENTS.md
cat > docs/roadmap.md <<"MD"
# Roadmap

- [x] **scaffold** · project skeleton and test runner
- [ ] **streaks** · show the current streak per habit · spec: docs/specs/streaks.md
MD
cat > docs/specs/streaks.md <<"MD"
# streaks

Status: building
Design: —

## Goal
Users see how many consecutive days, ending today, they checked in.

## Acceptance criteria
- [ ] Happy: check-ins on days 8, 9, 10 with today = 10 gives a streak of 3
- [ ] Edge: no check-in today gives a streak of 0

## Out of scope
- Date formatting (src/format.js belongs to another roadmap item)

## Approach
- src/streak.js: currentStreak(days, today)

## Tests
- tests/streak.test.js covers both criteria

## Handoff
Nothing built yet; start with the Happy criterion.

## Verify

## Fixes
MD
cat > src/format.js <<"JS"
function formatDay(n) {
  return "day " + (n + 1);
}
module.exports = { formatDay };
JS
cat > tests/format.test.js <<"JS"
const test = require("node:test");
const assert = require("node:assert");
const { formatDay } = require("../src/format.js");
test("formatDay labels a day number", () => assert.strictEqual(formatDay(3), "day 3"));
JS
git add -A && git commit -qm "scaffold"
