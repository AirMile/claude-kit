#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p src
printf '# api\n\nSmall fetch helper.\n\n## Commands\n\n- Dev: `node src/api.js`\n' > AGENTS.md
cat > src/api.js <<'JS'
async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}
module.exports = { fetchJson };
JS
git add -A && git commit -qm "scaffold"
