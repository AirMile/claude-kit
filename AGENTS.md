# kit

Claude Code plugin (`.claude-plugin/plugin.json`, name `kit`), also installed in Codex
(`.codex-plugin/plugin.json`, same version). Successor to `claude-config` (v1), built to stay small. Skills run
as `/kit:<skill>` (or bare `/<skill>` when unambiguous).

## Layout

- `skills/<name>/SKILL.md`: one workflow per skill; `task-readiness` is the core skill
- `agents/verifier.md`: fresh-context verify subagent used by `task-readiness`
- `hooks/hooks.json`: push-guard (PreToolUse) + format-on-save (PostToolUse);
  `hooks/push-guard.test.cjs` is its regression test. Its `modules` names `hooks/register.tsx`,
  the kit mod (Claude Code 2.1.287+): native compaction priorities and recovery note
  (`hooks/compaction.ts`), auto-compact at a task boundary with a compaction ledger and
  `/kitcompact` (`hooks/auto-compact.ts` on the pure `hooks/context-policy.ts`), `/pin` text that
  survives compaction word for word (`hooks/pins.ts`), the user's latest messages restored the
  same way (`hooks/recent.ts`; per-chat storage in `hooks/chat-store.ts`), usage figures, the tool
  `mcp__kit__theme_view` (`hooks/theme-view.tsx`) that `/theme` calls to open its pane, the
  dashboard pane on `/panel` and the band's button (`hooks/panel-open.ts`, `hooks/panel-view.tsx`,
  drawn by the pure `panel-tabs.tsx` on `panel-parts.tsx`; the Session tab's facts in
  `hooks/chat-facts.ts`), the band
  above the prompt (`hooks/kit-band.tsx`: one line of usage, switches a press
  cycles (the profile, GPT on or off, the limit button (Off (default), Warm, Limit: pause + warm while work is open; per chat)), the effort with ‹ › when the profile is off, git, dashboard; the menus in
  `hooks/band-menus.tsx`, the plan meters in `hooks/band-meters.tsx`: text on a terminal, elsewhere a 5h and a
  week ring of Claude, ChatGPT and Gemini (the pure `hooks/band-rings.ts`), Gemini's figures from
  `agy --print=/usage` in `hooks/agy-usage.ts`), model/effort per prompt and subagent
  (`hooks/auto-model.ts` on the pure `hooks/model-policy.ts`, switches kept by `hooks/model-switch.ts`, the Claude plan in `hooks/plan.ts`, `/mode`; every started subagent noted and logged by `hooks/spawn-record.ts`), flow (`hooks/flow.ts` on the pure `hooks/flow-policy.ts`, `hooks/flow-check.ts` and
  `hooks/flow-log.ts`, review and verifier glue in `hooks/flow-agents.ts`, evidence in
  `hooks/flow-evidence.ts` with hold advice in `hooks/flow-advice.ts`, task state in `hooks/flow-state.ts`, storage and git fingerprint in
  `hooks/flow-store.ts`: each change task's
  track light/medium/heavy, its note pointing to task-readiness at the start or on growth, the verify gate on `classic.Stop`
  from the worktree's git fingerprint, the checks (a masked exit status never credits a pass: `;`/`||` after the check, `||` before it in the same list, a background `&` or a pipe without `set -o pipefail` leave it indeterminate; only the check's own trailing `; echo <word>=$?` or `; echo $?` whose output shows 0 passes, and a final echo does not rescue a preceding `||`; a hold says so when no command this task was recognised as a check, counted by `checkCalls`/`shellCalls`, `noCheckSeen` in `hooks/flow-evidence.ts`), reviews and verifier's answer; unverified work stays open, `/flow` in `hooks/flow-command.ts`),
  the checker guard (`hooks/guard.ts` on the pure `hooks/guard-policy.ts`: `/guard on` denies edits to the
  `Protected:` globs of `AGENTS.md § Commands`, the lock in `$.store`), the commit gate (`hooks/commit-gate.ts` on
  `hooks/commit-gate-policy.ts`: `git commit` is denied while the open medium or heavy task is unverified, by the
  Stop gate's own evidence, `/commitgate off` per project),
  `mcp__kit__delegate` (`hooks/delegate.ts` on the pure `hooks/delegate-policy.ts`: review,
  second plan and a named model to GPT, on Claude Pro research and building too, within
  ChatGPT's limits (`hooks/gpt-limits.ts`), the newest GPT model per family; the
  Codex side, its catalog, the ChatGPT meters, the GPT switch and a run, in `hooks/codex-run.ts`;
  `/gpt` command in `hooks/gpt-command.ts`; its GPT run, route and writer lock in
  `hooks/delegate-run.ts`), `mcp__kit__run_task` (`hooks/task-runner.ts` on the pure
  `hooks/task-runner-policy.ts`: one GPT change, the chat's checks run by the mod, fixes on the
  same thread), ChatGPT's 5h window started with a new Claude one
  (`hooks/window-sync.ts` on the pure `hooks/window-sync-policy.ts`), GPT readiness and both plans' meters (`hooks/balance.ts`, `hooks/delegate-balance.ts`),
  task systems (the pure `hooks/task-policy.ts`: per typed prompt a Define/Execute/Verify/Refactor
  level and the one note with the next step; `hooks/flow-levels.ts` decides, raises and logs
  them with both 5h meters and feeds the band, flow keeps them on the task; classifiers in
  `hooks/flow-prompt.ts`, the explore label in `hooks/explore-first.ts`),
  read budgets (`hooks/read-budget.ts`, observed by `hooks/read-watch.ts`), a pause before the plan limit with
  cache keep-alive (`hooks/limit-guard.ts` on the pure `hooks/limit-policy.ts`, kept prompts and
  command replay in `hooks/limit-queue.ts`, text control with `/limit` in `hooks/limit-command.ts`), keep-alive forks by hand or
  for the pause (`hooks/keep-warm.ts`, `/warm`), `/band`,
  and `mcp__kit__fresh_start` (`hooks/fresh-start.ts`), for clearing and resuming. Only `register.tsx` registers events; `$` never crosses an import (the
  validator refuses it), so `hooks/spec.ts` stays pure
- `hooks/codex-hooks.json` (declared in `.codex-plugin/plugin.json`) → `hooks/codex-hooks.cjs`: push
  guard, format-on-save (also `apply_patch`) and, at session start, `hooks/codex-context.md`:
  how Codex reads the skills' Claude terms (AskUserQuestion, plan mode, `${CLAUDE_SKILL_DIR}`,
  the verifier, `mcp__*` tools). Skills stay worded for Claude; a new Claude-only term in a
  skill → map it there. `hooks/codex-hooks.test.cjs` also checks both manifests' versions
- Skill Feedback inbox: `~/.agents/kit/feedback.md`, one Markdown line per point (format in its
  header), written by the model in any project and read by `/improve`. No script
- `skills/agy/SKILL.md`: Gemini through the `agy` CLI, parallel to `codex`
- `skills/<name>/scripts/`: deterministic helpers (commit: `staging-check.js`, setup:
  `migrate-v1.js` and `detect-tools.js` (+ test: Test/Lint/Build/Security/Quality from manifests), scan: `seo-facts.js`, codex: `codex-status.js`), called via `${CLAUDE_SKILL_DIR}` and allowed in the
  skill's `allowed-tools`
- `rules/frontend.md`: path-scoped user rule; plugins can't ship rules, so it is symlinked to
  `~/.claude/rules/frontend.md` (see README)

## The project contract the skills share

Skills never share code or a `shared/` folder. They share **files in the target project**, and
each file carries its own format in a `<!-- format: … -->` header:

- `AGENTS.md` (root + nested per module): instructions and non-derivable lessons
- no `CLAUDE.md`: its presence would stop Claude Code from reading `AGENTS.md`
- `docs/product.md`, `docs/specs/<slug>.md`, `docs/decisions.md`
- `AGENTS.md § Backlog`: where the backlog lives (a Todoist project, a tracker) and its rules.
  The backlog is never a file in the repo
- `docs/seo.md`: intake, keywords, page plan, measurements (`scan`, `intake`, `seo` write it;
  `task-readiness`, `audit`, `launch` read it)

Change a format → update the header template in the skill that writes it (`product` for
product and `§ Backlog`, `setup` for AGENTS/decisions, `task-readiness/references/spec-template.md` for specs,
`seo` for seo.md).

## Budgets (hard)

- `SKILL.md` ≤ 150 lines (`task-readiness` ≤ 120); max 2 files in `references/`
- No `shared/` directory, no JSON state files
- Scripts only for deterministic checks or conversions with fixed output (Node, so they run on
  macOS and Windows). Never for reading/editing spec files: those are small and the
  model handles them; a script there is how v1 regrew
- Hooks and scripts must work on Windows too (e.g. `npx` is `npx.cmd` there)
- The mod (`hooks/*.ts*`) costs no context (it runs as code), so no total line budget: one
  purpose per file, ≤ ~300 lines each (larger → split). It reads only specs (`Status` +
  criteria), `AGENTS.md § Commands` (flow: which kinds of check a task must pass; guard: `Protected:` globs), the title of `docs/product.md` and read-only git state,
  plus `organizationType` from the login's `~/.claude.json` (`hooks/plan.ts`); it writes only
  `$.store` (pins among it). It starts Codex only for `mcp__kit__delegate`,
  `mcp__kit__run_task` and the window-sync ping: what a writing run changes is Codex's work, in
  Codex's sandbox, reviewed by the chat. It starts agy only for `mcp__kit__delegate` and, where
  the band draws rings, read-only for `/usage` (no model run). The only other commands it runs for the chat are the
  check argvs the chat passes to `run_task` (as the user, after the permission prompt). Flow reads the
  chat's own tool calls (Edit/Write, Bash), subagents' answers and read-only git state (`ls-files`,
  diff, `hash-object` without `-w`), and holds a turn's end; it writes only `$.store` (its
  open task per session, a 14-day log).
  `claude plugin test .`
- A rule that needs a second paragraph of exceptions is a sign to cut it, not to extend it
- Check: `wc -l skills/*/SKILL.md`

## Backlog

- The backlog is the Todoist project `claude-kit` (the newer one, not `Claude-Kit`; sections
  `Nu`, `Hierna`, `Ideeën`). Do not keep a list in the repo.
- Add items only after the user confirms; complete one only after the user confirms.

## Git

- Land: merge

## Conventions

- Skill and agent files: English. Runtime output follows the user's language setting.
- Lean on native Claude Code features (subagents, `/simplify`, `/security-review`,
  AGENTS.md loading) instead of rebuilding them.
- Never push without the user's OK (`hooks/push-guard.cjs`), except a plain push in auto mode (a force push still asks).
- Validate after edits: `claude plugin validate .`, `node hooks/push-guard.test.cjs` and
  `node hooks/codex-hooks.test.cjs`. At the root that validate only checks `marketplace.json`,
  never the mod: for hooks, copy `.claude-plugin/{plugin.json,types}`, `hooks`, `skills`,
  `agents` to a scratch dir and validate there. `node hooks/fixtures-shellcheck.test.cjs`
  (shellcheck on `evals/*/fixture.sh`; skips when `shellcheck` isn't installed). The install is a cached copy per version: to
  use edits, bump `version` in both `plugin.json` files, then
  `claude plugin marketplace update airmile && claude plugin update kit@airmile` (or test with
  `claude --plugin-dir .`).

## Evals

`evals/<case>/` holds `claude plugin eval` cases (fixture.sh + case.yaml + prompt.md + graders),
tagged per skill. Runs are non-interactive: test routing, files, tool calls and safety rules,
not flows that need a human answer. Cheap run for one skill (what `/improve` uses):

```bash
claude plugin eval . --trust-plugin --scaffold --allow-tools Bash Write Edit \
  --runs 1 --ablation none --no-publish --threshold 0 --max-cost-usd 3 --tag <skill>
```

Full check with the no-plugin baseline (after a model release, or monthly): drop `--runs 1
--ablation none --tag`, raise `--max-cost-usd`. A case whose Δ is ~0 means the skill line it
tests adds nothing: candidate for deletion. Every fixed behaviour bug gets a regression case
first (see `skills/improve`). Results land in `evals/results/` (gitignored).

What the eval sandbox can't show (Claude Code 2.1.287), so graders must not depend on it:

- No `EnterPlanMode`/`ExitPlanMode` (headless, `dontAsk`): assert "stopped before approval"
  with `tool_used` Write/Edit `max: 0` instead.
- A prompt that starts with `/kit:<skill>` is expanded, not a `Skill` call: `tool_used: Skill`
  only works for a skill fired by natural language or by another skill.
- `llm` with `focus: trace` sees only the first and last 12 trace lines, so mid-run
  Write/Edit calls are cut. Grade written files: `regex` with `target: {source: file, path}`.
- git (the `/usr/bin/git` xcrun shim) fails on macOS: xcrun caches in `/var/folders/…`, which
  the sandbox blocks; `TMPDIR`/`DEVELOPER_DIR` don't help and case `env` only takes `EVAL_*`.
  The sandbox also hides other git binaries from PATH lookup (stat denied), so `git` always
  resolves to the shim; Homebrew git runs only by full path (`/opt/homebrew/bin/git`), which
  the model finds by itself only sometimes. Grade git outcomes, not commands: have the prompt
  write `git` output to a file and regex that file (see `commit-no-push`). With only Apple's
  git installed, the `commit-*` cases always fail on macOS: ignore those scores there.
