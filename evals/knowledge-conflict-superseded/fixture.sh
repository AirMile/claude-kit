#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src docs
cat > AGENTS.md <<'X'
# shop

## Commands

<<<<<<< HEAD
- Test: `npm test`
- Lint: `eslint .`
=======
- Test: `pnpm test`
- Build: `vite build`
>>>>>>> origin/main
X
cat > docs/decisions.md <<'X'
<!-- format: newest first. Only decisions where an alternative was really rejected.
## YYYY-MM-DD · <decision>
Why: <reason> · Rejected: <alternative + why not> · Superseded by: <link or —> -->

# Decisions

## 2026-11-01 · Use pnpm
Why: workspaces and a lockfile that CI trusts · Rejected: npm (no workspace support) · Superseded by: —
X
echo 'export const x = 1;' > src/x.js
git add -A && git commit -qm init
