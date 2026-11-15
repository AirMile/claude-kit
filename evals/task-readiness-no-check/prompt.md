---
max_turns: 15
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
append_system_prompt: "Non-interactive eval run: nobody can answer questions or approve work. Give the skill's answer and stop."
---

/kit:task-readiness make fetchJson in src/api.js retry three times on a network error
