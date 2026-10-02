---
max_turns: 15
timeout_seconds: 300
allowed_tools: [Bash, Read, Glob, Grep, Skill]
append_system_prompt: "Non-interactive eval run: nobody can answer questions or approve plans. When a skill asks the user, take the recommended option; for an open question, pick a sensible answer from the request."
---

/kit:setup a habit tracker for people who quit after a week
