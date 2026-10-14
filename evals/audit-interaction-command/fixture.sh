#!/usr/bin/env bash
set -euo pipefail
cat > AGENTS.md <<'AGENTS'
# Audit fixture

This case tests the audit plan, not a real sweep. Use English for the generated plan.
AGENTS
cat > package.json <<'PKG'
{
  "name": "fixture",
  "private": true,
  "scripts": {
    "build": "next build",
    "start": "next start",
    "test:interactions": "playwright test e2e/interactions --project=chromium"
  }
}
PKG
