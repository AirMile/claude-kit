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
- Test: `pnpm test` (replaces npm test, which no longer works here)
- Build: `vite build`
>>>>>>> origin/main
X
echo 'export const x = 1;' > src/x.js
git add -A && git commit -qm init
