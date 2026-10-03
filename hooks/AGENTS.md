# hooks notes

- Register an event without a matcher (`on("session.start", …)`) once per mod: a second one in
  another file is refused at load. Use another event (`classic.SessionStart`) or hook into
  `register.tsx`'s handler.
- In `claude-code/testing`, a bottom hook for an API call (`session.root`, `fs.read`,
  `ui.status`, `store.keys` …) must return `{ value }`: a bare value is skipped and the call
  fails with "no implementation".
