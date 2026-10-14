---
max_turns: 10
timeout_seconds: 150
allowed_tools: [Read, Glob, Grep, Write, Skill]
---

/kit:convert

Run standalone, target app/page.tsx (new page). The Figma read is finished: its result
is in figma-read.md. Tokens are in app/globals.css; there is no Payload and no existing
section component. Nothing else needs reading from Figma.

Only write the plan you would present in plan mode to plan.md, with every part /convert
requires for this frame. Do not build, run a server, use a browser, commit, or ask for
approval in this fixture.
