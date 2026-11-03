<!-- format: items under phase (release) headings, one line per item, order = priority.
## v<version> · <name>
- [ ] **slug** · one-line description
- [ ] **slug** · description · spec: docs/specs/slug.md   ← in progress (spec exists, not done)
- [x] **slug** · description · spec: docs/specs/slug.md   ← done -->

# Roadmap

## v0.15.25

- [x] **native-compaction** · preserve task continuity through native compaction · spec: docs/specs/native-compaction.md

## v0.15.50 · plan usage

- [x] **window-sync** · start ChatGPT's 5h window together with Claude's · spec: docs/specs/window-sync.md
- [x] **task-systems** · route each request over Define/Execute/Verify/Refactor levels, GPT as default worker · spec: docs/specs/task-systems.md
- [x] **task-verify** · enforce V2/V3 in the flow gate for small tasks too; unverified work stays open · spec: docs/specs/task-verify.md
- [ ] **task-depth** · D3 council (Sol + Astra blind + critique) in one tool call, and R1/R2 refactor with re-verify

## v0.16 · smart context

- [ ] **context-ledger** · measure tool-result characters per tool via session.append and persist each compaction's tokensBefore/After, so thresholds come from data
- [ ] **context-spike** · two experiments, go/no-go for the next two items: a session.append rewrite reaches the model; a session.compact hook returning its own messages with one stubbed Read keeps tool pairs intact
- [ ] **check-collapse** · shrink successful check output (build, test, install) at write time, failures stay whole; after a spike go
- [ ] **context-prune** · age re-readable tool results into one-line stubs inside the session.compact hook, own file ≤300 lines, no LLM summary; after a spike go
- [ ] **context-policy** · auto compact trigger on the Messages category with absolute token thresholds and a cooldown; hard threshold automatic, soft as toast or band button; thresholds from ledger data
- [ ] **fresh-anywhere** · clear and resume at any task boundary, always the user's choice, needs a current spec Handoff
- [ ] **agent-brief-cap** · fixed return format and answer cap for Claude subagents, plus a cumulative read budget per task

## Later

- **window-sync-now** · take `now` after the status read, so the 30-minute gap can't pass by about a minute at the edge
- **council-test-name** · `hooks/read-watch.test.ts` council test promises the D2 fallback but only asserts D3: rename it or add the case
- **claude5h-log-test** · no test asserts `claude5h` in the decision log
- **gpt-off-reason** · the budget reason says "GPT has no room" also when GPT is switched off in the band
- **lessons-gates** · rewrite `skills/lessons`: gate 1 "not adequately conveyed by code/config" (a rule may stay although its reason is in git), gate 3 also accepts spec Handoff/Fixes/Verify, destination table (AGENTS, decisions with `Superseded by:`, Handoff, Later, feedback inbox), candidate first then read; first attempt is commit fe288f2
- **lessons-commit-caller** · `commit` step 1b as the only automatic caller of `lessons` (drop the calls in build Small/Finish, debug.md, convert, payload.md); keep the spec Handoff when `done`, stage only the note's own changes after staging safety; measure `/commit` effort first (`hooks/model-policy.ts:78`)
- **agents-size-check** · small Node script in `skills/lessons/scripts/` that counts AGENTS.md lines and WARNs over 100 (root) / 40 (nested); first trim kit's own root AGENTS.md (143 lines: module inventory, Evals section to nested files)
- **knowledge-haiku** · optional `$.model.complete` helper for knowledge candidates, dropped for now (rows have no stable ids, evals can't seed a transcript, injection path); reopen after a manual sample of ~20 checkpoints shows missed lessons; `$.model.fork` fits better than `complete`
- **knowledge-evals** · stronger evals for the knowledge checkpoint (late checkpoint after a long session, commit step 1b); the current `knowledge-*` cases score 3/3 on old and new skills, and `commit-*` cases fail on macOS with only Apple's git
- **verdict-bold** · `hooks/flow-evidence.ts` `parseReview`: accept `Verdict: **pass**`; bold on the word only reads as no verdict, which costs an extra review
- **spawned-cleanup** · `hooks/flow-agents.ts` `spawned`: entries for agents that never answer stay in memory, and `flowSpawned` has no try/catch around work done after the agent has started
- **review-error-answer** · `hooks/delegate.ts`: any Codex `error` event discards a review whose answer was complete (recorded as `error`, unless it says `verdict: fail`); first check whether transient errors occur
- **run-task-auto** · in auto mode the classifier, not a prompt, decides on `run_task`'s host checks: AGENTS.md's "after the permission prompt" and the comment at `hooks/task-runner.ts:194` promise more than that; a dialog was never observed
- **run-task-permission-test** · the permission test registers its own "ask" handler, so it can't fail if an allow is added later: assert that no tool.check is registered for run_task instead
- **run-task-no-changes** · `run_task` reports `pass` while GPT changed nothing: say "pass, no changes" or stop
- **run-task-timeout** · a timed-out check may keep running (`$.process.run`'s contract doesn't say it kills the child); timeout vs "could not start" is guessed from elapsed time and the message
- **run-task-log** · read-watch counts a `stopped` run where Codex never started as a GPT run (and resets the read budget); the tail is stdout+stderr concatenated, so stderr-biased
- **build-run-task** · `skills/build/SKILL.md` 4b.2 still names delegate `build` for criteria, while the E1/E2 notes say `run_task`
