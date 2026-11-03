#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src docs

printf '# shop\n' > AGENTS.md
cat > docs/decisions.md <<'X'
<!-- format: newest first. Only decisions where an alternative was really rejected.
## YYYY-MM-DD · <decision>
Why: <reason> · Rejected: <alternative + why not> · Superseded by: <link or —> -->

# Decisions

## 2026-09-01 · Use REST for the orders API
Why: simplest for the first client · Rejected: GraphQL (too heavy for one client) · Superseded by: —
X
echo 'export const x = 1;' > src/x.js
git add -A && git commit -qm init
