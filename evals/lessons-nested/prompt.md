---
max_turns: 15
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

We just lost an hour on this: the orders API behind src/api returns `createdAt` as Unix seconds, not milliseconds, so every date showed up as January 1970. I fixed it already. Make sure future sessions working in this code know it.
