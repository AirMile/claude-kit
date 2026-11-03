---
max_turns: 12
timeout_seconds: 200
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: "Non-interactive eval run: nobody can approve plans. Present the plan for approval and stop."
---

/kit:build weekly-counts

Add `weeklyCounts(checkIns, startDay)` in `src/weekly-counts.js`, exporting it
with CommonJS. Both inputs use integer day numbers. Return seven counts for
`startDay` through `startDay + 6`, in order. Duplicates count separately;
days outside that range are ignored. Empty input returns seven zeroes.
Throw TypeError if checkIns is not an array of integers or startDay is not
an integer. Cover these cases with node:test in tests/weekly-counts.test.js.
There are no other design choices. Show the complete plan and wait for my OK.
