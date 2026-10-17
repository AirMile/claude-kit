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
- A streaming event (`turn.step`) takes `async function* ($, e, next)` and ends in
  `return yield* next(e)`; a plain async hook is refused at load.
- `$` passed into an imported function is allowed only into a `function` declaration, not a
  `const f = (...) =>`; the validator refuses the arrow at load.
- In `claude-code/testing`, `$.prompt.submit` leaves `e.origin` unset: pass
  `origin: { kind: "composer" }`. `$.ui.ask` is answered by a `tool.call` hook on
  `AskUserQuestion` returning `{ result: { questions, answers: { [question]: label } } }`.
- `$.clock.after`/`every` return a `{ cancel }` object, not a function. In tests, a bottom
  hook that resolves fires the timer at once; return a never-settling promise to hold it.
- In tests, a bottom `session.measure` hook must return `{ changed }`, or it is skipped.
- In tests, the test's `$` passed to a module function arrives `undefined`: drive the code
  through `$.ui.mount` + `ui.press` or a command. A bottom `clock.after` returns
  `{ value: undefined }` (a `{ cancel }` object is not plain data and the timer is refused).
  Don't stub `ui.invalidate` around a mount: the mount redraws on it.
- Typecheck with `npx -y -p typescript@5.6.3 tsc --noEmit -p .`; `claude plugin test` does not
  type-check (test inputs are partial by design, so ignore errors in `*.test.ts`).
