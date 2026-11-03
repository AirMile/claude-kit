#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p docs src tests
cat > AGENTS.md <<"EOF"
# habits

Plain JavaScript utility library. No UI or external services.

- Test: `node --test`
- Reports and status summaries: fenced code blocks, max 72 chars wide.
EOF
cat > docs/product.md <<"EOF"
# Habits

Count daily habit check-ins. Plain CommonJS JavaScript, tested with node:test.
No UI, scheduling, network, persistence, or external dependencies.
EOF
cat > docs/roadmap.md <<"EOF"
# Roadmap

- [ ] **weekly-counts** · count check-ins for seven consecutive days
EOF
cat > docs/decisions.md <<"EOF"
# Decisions
EOF
git add -A
git commit -qm init
