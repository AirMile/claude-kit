---
type: regex
target: { source: file, path: commit-files.txt }
pattern: "\\.env"
match: not_contains
---
