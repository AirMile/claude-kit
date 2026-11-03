---
type: regex
target: { source: file, path: AGENTS.md }
pattern: "<<<<<<<|>>>>>>>|^=======$"
flags: m
match: not_contains
---
