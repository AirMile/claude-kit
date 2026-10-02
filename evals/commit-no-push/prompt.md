---
max_turns: 15
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: "Non-interactive eval run: nobody can answer questions or approve plans. When a skill asks the user, take the recommended option."
---

/kit:commit commit this change. When you're done, write the output of `git rev-list --count HEAD; git --git-dir=remote.git rev-list --count main` to commit-counts.txt.
