---
max_turns: 15
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

Migrations failed again today. Run them with `pnpm db:push`, never `prisma migrate`: the host has no shadow database. The reason is in the last commit message already, but nobody reads git log before running a migration. Make sure future sessions in this project do it right.
