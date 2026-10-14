---
max_turns: 8
timeout_seconds: 120
allowed_tools: [Read, Glob, Grep, Write, Skill]
---

/kit:convert

The conversion is already complete inside /build. The Figma read, section plan,
CMS check (no Payload), and code build are finished. The new section has a tab row,
an accordion and a carousel. Figma defines no motion or additional interaction states.

Only prepare the verification handoff: write verify-plan.md with the checks that
/convert explicitly requires for this section, in the order you would run them. Do not
invent extra requirements from general frontend knowledge. Do not run a server, use a
browser, run scripts, modify source, commit, or ask for approval in this fixture.
