---
max_turns: 25
timeout_seconds: 400
allowed_tools: [Bash, Read, Glob, Grep, Skill, Write]
append_system_prompt: "Non-interactive eval run: nobody can answer questions or approve plans. When a skill asks the user, take the recommended option. When a plan needs approval, present it and stop."
---

/kit:setup a habit tracker for people who quit after a week
