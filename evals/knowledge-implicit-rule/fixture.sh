#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src
printf '# shop\n\n## Commands\n\n- Test: `node --test`\n' > AGENTS.md
echo 'export const db = null;' > src/db.js
git add -A && git commit -qm init
echo '// push' >> src/db.js
git commit -qam 'chore(db): switch to db:push

prisma migrate dev fails on the host: there is no shadow database. Always run
migrations with pnpm db:push there.'
