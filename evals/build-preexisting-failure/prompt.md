---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Agent, Bash, Write, Edit]
append_system_prompt: "Non-interactive eval run: nobody can answer questions or approve plans. When a skill asks the user, take the recommended option."
---

/kit:build streaks
