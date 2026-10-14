# hooks notes

- Register an event without a matcher (`on("session.start", …)`) once per mod: a second one in
  another file is refused at load. Use another event (`classic.SessionStart`) or hook into
  `register.tsx`'s handler.
- Keep Claude Code's `modules` in `hooks/hooks.json`; Codex rejects it. Codex's hooks are
  `hooks/codex-hooks.json`, named by `hooks` in `.codex-plugin/plugin.json`. Never add a root
  `plugin.json`: Codex then loads no kit hooks at all, silently (0.162, checked via
  `codex app-server` `hooks/list`).
- In `claude-code/testing`, a bottom hook for an API call (`session.root`, `fs.read`,
  `ui.status`, `store.keys` …) must return `{ value }`: a bare value is skipped and the call
  fails with "no implementation".
