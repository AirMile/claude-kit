---
type: llm
focus: trace
---

Judge the migration Claude proposed or wrote (proposed AGENTS.md, roadmap, CLAUDE.md).

PASS only if all hold:
- The roadmap contains export-csv and does NOT contain verify-invoices-manual.
- The bank-API cents/BigInt pitfall appears once (not twice, not in two languages), placed in src/api/AGENTS.md or the root AGENTS.md.
- The worktree / .project/archive symlink pitfall is dropped.
- The deploy runbook (pnpm db:migrate before deploy) is kept in AGENTS.md.
- CLAUDE.md is removed (or proposed for removal) after its useful content moved into AGENTS.md.

FAIL if any of these is violated or the migration was not attempted.
