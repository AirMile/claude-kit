#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src tests docs/specs
printf '# habits\n\nHabit tracker in plain JavaScript.\n\n## Commands\n\n- Test: `node --test`\n' > AGENTS.md
cat > docs/roadmap.md <<"MD"
# Roadmap

- [x] **scaffold** · project skeleton and test runner
- [ ] **streaks** · show the current streak per habit · spec: docs/specs/streaks.md
- [ ] **reminders** · daily push reminder at a time the user picks
MD
cat > docs/specs/streaks.md <<"MD"
# streaks

Status: verifying
Design: —

## Goal
Users see how many consecutive days, ending today, they checked in.

## Acceptance criteria
- [ ] Happy: check-ins on days 8, 9, 10 with today = 10 gives a streak of 3
- [ ] Edge: no check-in today gives a streak of 0
- [ ] Error: an empty list of check-ins gives 0, not an exception

## Approach
- src/streak.js: currentStreak(days, today)

## Tests
- tests/streak.test.js covers all three criteria

## Verify

## Fixes
MD
cat > src/streak.js <<"JS"
function currentStreak(days, today) {
  let streak = 0;
  for (let d = today; days.includes(d); d--) streak++;
  return streak;
}
module.exports = { currentStreak };
JS
cat > tests/streak.test.js <<"JS"
const test = require("node:test");
const assert = require("node:assert");
const { currentStreak } = require("../src/streak.js");
test("happy", () => assert.strictEqual(currentStreak([8, 9, 10], 10), 3));
test("edge: no check-in today", () => assert.strictEqual(currentStreak([8, 9], 10), 0));
test("error: empty list", () => assert.strictEqual(currentStreak([], 10), 0));
JS
git add -A && git commit -qm "streaks: build"
