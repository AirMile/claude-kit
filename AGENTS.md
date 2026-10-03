# kit

Claude Code plugin (`.claude-plugin/plugin.json`, name `kit`). Successor to `claude-config`
(v1), built to stay small. Skills run as `/kit:<skill>` (or bare `/<skill>` when unambiguous).

## Layout

- `skills/<name>/SKILL.md`: one workflow per skill
- `agents/verifier.md`: fresh-context verify subagent used by `build`
- `hooks/hooks.json`: push-guard (PreToolUse) + format-on-save (PostToolUse);
  `hooks/push-guard.test.cjs` is its regression test. Its `modules` names `hooks/register.tsx`,
  the kit mod (Claude Code 2.1.287+): compaction note, usage figures, and the tools
  `mcp__kit__roadmap_view` / `mcp__kit__theme_view` (`hooks/roadmap-open.ts`,
  `hooks/theme-view.tsx`) that `/product` and `/theme` call to open their panes (the roadmap
  pane draws through the pure `roadmap-{dashboard,phase,card,later}.tsx` on `roadmap-parts.tsx`),
  `mcp__kit__fresh_start` (`hooks/fresh-start.ts`), which `/build`'s safe point calls to clear
  and resume, and `mcp__kit__feedback` (`hooks/feedback-inbox.ts` over the pure `feedback.ts`),
  the Skill Feedback inbox `/improve` reads. Only `register.tsx` registers events; `$` never
  crosses an import (the validator refuses it), so `hooks/spec.ts` stays pure
- `skills/<name>/scripts/`: deterministic helpers (commit: `staging-check.js`, setup:
  `migrate-v1.js`), called via `${CLAUDE_SKILL_DIR}` and allowed in the skill's `allowed-tools`
- `rules/frontend.md`: path-scoped user rule; plugins can't ship rules, so it is symlinked to
  `~/.claude/rules/frontend.md` (see README)

## The project contract the skills share

Skills never share code or a `shared/` folder. They share **files in the target project**, and
each file carries its own format in a `<!-- format: … -->` header:

- `AGENTS.md` (root + nested per module): instructions and non-derivable lessons
- no `CLAUDE.md`: its presence would stop Claude Code from reading `AGENTS.md`
- `docs/product.md`, `docs/roadmap.md`, `docs/specs/<slug>.md`, `docs/decisions.md`

Change a format → update the header template in the skill that writes it (`product` for
product/roadmap, `setup` for AGENTS/decisions, `build/references/spec-template.md` for specs).

## Budgets (hard)

- `SKILL.md` ≤ 150 lines (`build` ≤ 200); max 2 files in `references/`
- No `shared/` directory, no JSON state files
- Scripts only for deterministic checks or conversions with fixed output (Node, so they run on
  macOS and Windows). Never for reading/editing roadmap or spec files: those are small and the
  model handles them; a script there is how v1 regrew. One exception: the roadmap pane edits
  open items of `docs/roadmap.md` (add, change phase, move to Later, remove, restore) via
  `hooks/roadmap-file.ts`, which keeps untouched lines byte for byte and refuses done and
  in-progress items (their state is `/build`'s); `hooks/roadmap-file.test.ts` guards it
- Hooks and scripts must work on Windows too (e.g. `npx` is `npx.cmd` there)
- The mod (`hooks/*.ts*`) costs no context (it runs as code), so no total line budget: one
  purpose per file, ≤ ~300 lines each (larger → split). It reads only specs (`Status` +
  criteria), `docs/roadmap.md`, `.claude-plugin/plugin.json` (a kit checkout?) and read-only
  git state (status, branch, commits not on `origin/HEAD`, spec commits on other branches);
  it writes only through `roadmap-file.ts` and `$.store` (worktree marks, `feedback:*` inbox).
  Schema or roadmap format change → update `roadmap-file.ts` + its skill. `claude plugin test .`
- A rule that needs a second paragraph of exceptions is a sign to cut it, not to extend it
- Check: `wc -l skills/*/SKILL.md`

## Conventions

- Skill and agent files: English. Runtime output follows the user's language setting.
- Lean on native Claude Code features (plan mode, subagents, `/simplify`, `/security-review`,
  AGENTS.md loading) instead of rebuilding them.
- Never push without the user's OK (`hooks/push-guard.cjs`), except `/build` merging into main.
- Validate after edits: `claude plugin validate .` and `node hooks/push-guard.test.cjs`. At
  the root that validate only checks `marketplace.json`, never the mod: for hooks, copy
  `.claude-plugin/{plugin.json,types}`, `hooks`, `skills`, `agents` to a scratch dir and
  validate there. The install is a cached copy per version: to use edits, bump `version` in `plugin.json`, then
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
