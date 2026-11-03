---
type: regex
target: { source: file, path: AGENTS.md }
pattern: "^.*db:push.*$"
flags: m
match: "count:1"
---
