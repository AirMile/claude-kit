#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src/api src/ui
printf '# shop\n\n## Commands\n\n- Test: `node --test`\n' > AGENTS.md
echo 'export async function getOrders() { return fetch("/orders").then(r => r.json()); }' > src/api/orders.js
echo 'export const Orders = () => null;' > src/ui/Orders.js
git add -A && git commit -qm init
