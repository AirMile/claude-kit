---
max_turns: 10
timeout_seconds: 150
allowed_tools: [Read, Glob, Grep, Write, Skill]
---

/kit:convert

Run standalone, target app/faq/page.tsx (new page). The Figma read is finished: its result is
in figma-read.md. Tokens are in app/globals.css. The project uses Payload; there is no
existing block for these sections. Nothing else needs reading from Figma.

Only write the plan you would present to plan.md, with every part /convert requires for this
frame. Do not build, run a server, use a browser, commit, touch a database, or ask for
approval in this fixture.
