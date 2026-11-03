#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src docs

printf '# shop\n\n## Commands\n\n- Test: `node --test`\n' > AGENTS.md
echo 'export const db = null;' > src/db.js
git add -A && git commit -qm init
echo '// push' >> src/db.js
git commit -qam 'chore(db): switch to db:push

The host has no shadow database, so prisma migrate dev fails there.'
