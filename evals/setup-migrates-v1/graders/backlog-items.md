---
type: llm
focus: trace
---

The migration moves the open v1 backlog items into a backlog. This project has no backlog tool,
so the assistant shows the items in the conversation. Pass only when the assistant's messages
name `export-csv` as a backlog item to keep, and never offer `verify-invoices-manual` as an
item to keep (naming it as dropped is fine).
