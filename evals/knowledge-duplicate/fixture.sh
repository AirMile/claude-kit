#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src docs

printf '# shop\n\n## Pitfalls\n\n- Run migrations with pnpm db:push, not prisma migrate: the host has no shadow DB.\n' > AGENTS.md
echo 'export const db = null;' > src/db.js
git add -A && git commit -qm init
