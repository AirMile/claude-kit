---
type: regex
target: { source: file, path: AGENTS.md }
pattern: "^- Test: .npm test.$"
flags: m
match: not_contains
---
