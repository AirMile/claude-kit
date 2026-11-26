#!/usr/bin/env bash
# A v1 migration that stopped halfway: docs/ written, no AGENTS.md yet.
set -euo pipefail
git init -q -b main
git config user.email eval@example.com
git config user.name eval
mkdir -p .project docs src/api
cat > package.json <<"J"
{ "name": "ledger", "scripts": { "test": "vitest run" } }
J
echo 'export {}' > src/api/client.ts
cat > docs/product.md <<"MD"
# ledger

## What

Bookkeeping app for freelancers.
MD
cat > docs/decisions.md <<"MD"
<!-- format: newest first. Only decisions where an alternative was really rejected.
## YYYY-MM-DD · <decision>
Why: <reason> · Rejected: <alternative + why not> · Superseded by: <link or —> -->

# Decisions

<!-- migrating from v1 2026-11-20 -->
MD
cat > .project/backlog.json <<"J"
{ "schemaVersion": 2, "features": [
  { "name": "invoices", "status": "DONE", "description": "Create and list invoices." }
] }
J
cat > .project/conventions.md <<"MD"
<!-- conventions-status: set -->

# Project Conventions

## Money

- Every amount is an integer number of cents; never store euros as a float.
MD
cat > .project/project-context.json <<"J"
{ "schemaVersion": 2, "learnings": [
  { "type": "pitfall", "summary": "The bank API returns amounts in cents as strings; parse with BigInt, never parseFloat.", "paths": ["src/api/client.ts"] }
] }
J
echo ".project/" > .gitignore
git add -A && git commit -qm init
