---
max_turns: 20
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: "Non-interactive eval run: nobody can answer questions. When a skill asks the user, take the recommended option."
---

/kit:commit commit my changes. When you're done, write the output of `git show --name-only --format= HEAD` to commit-files.txt.
