---
max_turns: 8
timeout_seconds: 120
allowed_tools: [Read, Glob, Grep, Skill]
---

/kit:convert

The conversion is already complete inside /build. The Figma read, section plan,
CMS check (no Payload), and code build are finished. The page has navigation links,
buttons, tabs, an accordion, a carousel, a contact form with three steps, a mobile
menu, and a dialog. Figma defines no motion or additional interaction states.

Only prepare the verification handoff: write verify-plan.md with the checks that
/convert explicitly requires for this page. Do not invent extra requirements from
general frontend knowledge. Do not run a server, use a browser, modify source,
commit, or ask for approval in this fixture.
