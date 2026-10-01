---
max_turns: 25
timeout_seconds: 400
allowed_tools: [Read, Glob, Grep, Skill, EnterPlanMode, ExitPlanMode]
append_system_prompt: "Non-interactive eval run: nobody can answer questions or approve plans. When a skill asks the user, take the recommended option. When a plan needs approval, present it and stop."
---

/kit:build reminders
