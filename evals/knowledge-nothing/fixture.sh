#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src docs

printf '# shop\n' > AGENTS.md
echo 'export const foo = 1;' > src/util.js
git add -A && git commit -qm init
