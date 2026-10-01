#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
git init -q --bare remote.git
echo "remote.git/" > .gitignore
echo 'export const x = 1;' > a.js
git add -A && git commit -qm "chore: init"
git remote add origin ./remote.git
git push -q -u origin main
echo 'export const x = 2;' > a.js
