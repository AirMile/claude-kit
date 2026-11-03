---
max_turns: 15
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

We agreed today to move the orders API from REST to GraphQL, because three clients now need different field sets and REST over-fetches. REST stays rejected for new endpoints. Record this decision in the project docs so a future session does not bring REST back.
