---
max_turns: 15
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

Remember this for future sessions: migrations run with `pnpm db:push`, not `prisma migrate`, because the host has no shadow database.
