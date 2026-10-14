#!/usr/bin/env bash
set -euo pipefail
cat > AGENTS.md <<'AGENTS'
# Convert verification fixture

This case tests the verification handoff, not a full visual conversion.
Use English for the generated checklist.
AGENTS
cat > package.json <<'PKG'
{
  "name": "fixture",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "test:interactions": "playwright test e2e/interactions --project=chromium"
  }
}
PKG
