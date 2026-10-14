---
max_turns: 8
timeout_seconds: 120
allowed_tools: [Read, Glob, Grep, Write, Skill]
---

/kit:audit

The site has eight pages in its sitemap, and several buttons link to `/contact#form`.
Only plan the sweep: write audit-plan.md with the checks /audit explicitly requires,
including how links and their fragments are checked. Do not invent extra requirements
from general frontend knowledge. Do not run a server, use a browser, run scripts,
modify source, commit, or ask for approval in this fixture.
