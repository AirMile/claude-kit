<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# window-sync

Status: verifying
Design: —

## Goal

Claude and ChatGPT each give a 5-hour window. ChatGPT's starts at the first request after the
previous window ended (OpenAI help: "How resets work in Codex"). When a new Claude window
starts while ChatGPT's is idle, kit sends one tiny Codex request, so both windows start and
reset together and one reset time in the band holds for both. Weekly windows stay as they are.

Measured (codex-status.js, 28 Oct): while ChatGPT's window is idle, its `resetsAt` reads as
"now + 5h" and moves with every read (12:08 → 17:08:18, pct 0). Once used, it stays fixed
(12:10 → 17:10:12, and 17:10:12 still at 13:11, pct 45).

## Acceptance criteria

- [ ] Happy: after a turn in a Claude 5h window that is in use (pct > 0) and started ≤ 30 min
      ago, with ChatGPT's 5h window idle (pct 0 and `resetsAt` passed or reading as "now + 5h")
      and GPT on, kit sends one Codex ping (newest Luna, effort low, read-only, ephemeral) and
      shows one toast. After that, ChatGPT's `resetsAt` lies within 30 min of Claude's.
- [x] Edge: at most one ping per Claude window, also across sessions and restarts (the window
      start is kept in `$.store`); no ping while ChatGPT's window is still running, while the
      Claude window started > 30 min ago, or while there is no Claude 5h reading.
- [x] Edge: GPT off, Codex missing or not logged in, or no Luna in the catalog → no ping and
      no message.
- [x] Error: the ping fails or times out (60 s) → no retry in this window, one line in
      `/gpt` ("window sync: failed at <time>"), and the turn is never held or slowed (the ping
      runs in the background).
- [x] Happy: `/gpt` shows the sync state: `window sync: <time>` of the last ping, or `—`.

## Out of scope

- Aligning the weekly windows (Claude's is fixed per account; aligning means leaving GPT idle).
- A switch to turn the sync off (GPT off already stops it; add one if it ever gets in the way).
- Changing the band: it already shows Claude's reset time.

## Approach

- `hooks/window-sync-policy.ts` (new, pure): `gptIdle(w, readAt)` = pct 0 and (no
  `resetsAt`, `resetsAt` ≤ `readAt`, or `resetsAt − readAt ≥ 5h − 2 min`: the idle, moving
  value); a fixed future reset means a running window, even at a rounded 0%;
  `claudeStart(w)` = `resetsAt − 5h`; `shouldPing({ claude, gpt, gptReadAt, now, synced })`
  → `{ ping: boolean, start?: string }` with the 30-minute rule and the once-per-window key.
- `hooks/window-sync.ts` (new): `syncWindows($, readings)`. Reads `gptOn`, `gptCached()`; when
  the policy says the Claude window is new and unsynced, refresh the status once
  (`gptStatus($, true)`) and decide again. Ping: store the window start first (so a crash or a
  second session never pings twice), then without awaiting run `runCodex` (codex-run.ts) with
  `exec --json --ephemeral --model <luna> -c model_reasoning_effort="low" --sandbox read-only
--skip-git-repo-check -` and the brief "Reply with: ok" (no tools needed). runCodex's own
  timeout waits for output, so the ping gets a hard 60 s deadline of its own (the stream
  stopped). Re-check `gptOn` just before spawning. Then `gptStatus($, true)`, a toast
  ("kit: ChatGPT's 5h window now runs with Claude's, both reset at <time>") and
  `{ at, ok }` of the last ping kept for `/gpt`.
- `hooks/register.tsx`: call `syncWindows($, e.rateLimits)` in `session.measure` after
  `noteLimits`, not awaited past the store write.
- `hooks/gpt-command.ts`: one `window sync:` line in the status text.
- `AGENTS.md`: Layout names the two files; the budget line "It starts Codex only for
  `mcp__kit__delegate`" gains "and the window-sync ping".

Open points (blind second plan by Sol, differences):

- Sol: decide "idle" from two forced reads where `resetsAt` moves. Not taken: pct 0 plus the
  "now + 5h" value from one fresh read is enough, and the worst miss is one harmless ping.
- Sol: `$.store` is not atomic across sessions, so two sessions measuring at the same second
  could both ping. Accepted as best effort: the claim is written before the spawn.

## Tests

- `hooks/window-sync-policy.test.ts` (new): idle by moving value / past reset / fixed future
  reset; new window boundaries (29 vs 31 min); once per window; no Claude reading → no ping.
- `hooks/window-sync.test.ts` (new, claude-code/testing with a fake Codex like
  `delegate.test.ts`): one ping with Luna/low/read-only after a measure; none on a second
  measure; none with GPT off or without Luna; a failing ping is recorded and not retried; the
  measure hook returns before the ping ends; `/gpt` shows the line.
- Live: after the next Claude reset, `/gpt` shows `window sync: <time>` and both 5h resets in
  the band's hover card differ by ≤ 30 min.

## Handoff

- Built, verified and fixed (all uncommitted); see `## Verify`. Status stays `verifying`
  until the two manual items are done; criterion 1 stays open until the live check.
- Also in this change, on the user's request: the band shows short effort words (`med`, `hi`,
  `xhi`; `low`/`max` as is) via `effortLabel` in `hooks/model-policy.ts`, used by `runLine`
  and the ‹ › stepper in `hooks/kit-band.tsx`.
- The user asked: commit everything (incl. the earlier `hooks/band-meters.tsx` change, version
  0.15.50) and update the plugin (`claude plugin marketplace update airmile && claude plugin
  update kit@airmile`). No push.

## Verify

- Verifier (round 1): criteria 2, 3 and 5 passed. Criterion 4 failed: `return()` on the stream
  waits behind a pending read, so a silent Codex kept `runCodex` waiting, `busy` stuck and
  `/gpt` showing success. A GPT review (Sol) found the same, plus a stale idle cache that
  could ping without a fresh read and a signal-killed run that counted as success.
- Fixed: `runCodex` races each read against the deadline and returns at once (the child is
  then ended with `return()`); a signal end is an error; an idle reading older than 60 s is
  read again before a ping. New tests: a silent Codex with a later timer, and Codex missing.
  Suite 154 pass, 0 fail; tsc clean outside tests; scratch validate passes.
- Criterion 1 is built and tested; its "within 30 min" part needs a live Claude reset.
- Manual, open: (1) after a real Claude reset with ChatGPT idle: one toast, `/gpt` shows
  `window sync: <time>`, both 5h resets ≤ 30 min apart, no second ping in that window.
  (2) a stub `codex` that sleeps silently: after ~70 s `/gpt` shows `failed at`, the stub
  process is gone.
- Improvement notes: `now` is taken before the status read, so the gap can pass 30 min by
  about a minute at the edge.

## Fixes
