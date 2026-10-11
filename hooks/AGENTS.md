# hooks notes

- Register an event without a matcher (`on("session.start", …)`) once per mod: a second one in
  another file is refused at load. Use another event (`classic.SessionStart`) or hook into
  `register.tsx`'s handler.
- Keep Claude Code's `modules` in `hooks/hooks.json`; Codex rejects it. Declare a separate Codex
  hooks file through `extensions.com.openai.hooks` in the root `plugin.json`.
- In `claude-code/testing`, a bottom hook for an API call (`session.root`, `fs.read`,
  `ui.status`, `store.keys` …) must return `{ value }`: a bare value is skipped and the call
  fails with "no implementation".
