#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src tests docs
cat > AGENTS.md <<"EOF"
# habits

Habit tracker in plain JavaScript (no build step).

## Commands

- Test: `node --test`
EOF
cat > docs/roadmap.md <<"EOF"
<!-- format: one line per item, order = priority.
- [ ] **slug** · one-line description
- [ ] **slug** · description · spec: docs/specs/slug.md   ← in progress (spec exists, not done)
- [x] **slug** · description · spec: docs/specs/slug.md   ← done -->

# Roadmap

- [x] **scaffold** · project skeleton and test runner
- [ ] **reminders** · daily push reminder at a time the user picks
EOF
cat > src/header.html <<"EOF"
<header><h1>Welcom to Habits</h1></header>
EOF
cat > src/streak.js <<"EOF"
// Current streak: number of consecutive days, ending today, with a check-in.
// days: sorted array of day numbers (integers), today: day number.
function currentStreak(days, today) {
  let streak = 0;
  for (let d = today; days.includes(d); d--) streak++;
  return streak;
}
module.exports = { currentStreak };
EOF
cat > tests/streak.test.js <<"EOF"
const test = require("node:test");
const assert = require("node:assert");
const { currentStreak } = require("../src/streak.js");
test("three consecutive days ending today", () => {
  assert.strictEqual(currentStreak([8, 9, 10], 10), 3);
});
EOF

# introduce an off-by-one: today is not counted
cat > src/streak.js <<"JS"
// Current streak: number of consecutive days, ending today, with a check-in.
// days: sorted array of day numbers (integers), today: day number.
function currentStreak(days, today) {
  let streak = 0;
  for (let d = today - 1; days.includes(d); d--) streak++;
  return streak;
}
module.exports = { currentStreak };
JS
git add -A && git commit -qm init
