---
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Agent]
append_system_prompt: "Non-interactive eval run: nobody can answer questions or approve plans. When a skill asks the user, take the recommended option."
---

/kit:build
