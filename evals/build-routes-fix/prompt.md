---
max_turns: 25
timeout_seconds: 400
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: "Non-interactive eval run: nobody can answer questions or approve plans. When a skill asks the user, take the recommended option."
---

/kit:build "fix: the streak counter shows one day too few"
