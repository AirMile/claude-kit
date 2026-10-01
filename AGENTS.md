# kit

Claude Code plugin (`.claude-plugin/plugin.json`, name `kit`). Successor to `claude-config`
(v1), built to stay small. Skills run as `/kit:<skill>` (or bare `/<skill>` when unambiguous).

## Layout

- `skills/<name>/SKILL.md`: one workflow per skill
- `agents/verifier.md`: fresh-context verify subagent used by `build`
- `hooks/hooks.json`: push-guard (PreToolUse) + format-on-save (PostToolUse);
  `hooks/push-guard.test.cjs` is its regression test
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

Change a format → update the header template in the skill that writes it (`roadmap` for
product/roadmap, `setup` for AGENTS/decisions, `build/references/spec-template.md` for specs).

## Budgets (hard)

- `SKILL.md` ≤ 150 lines (`build` ≤ 200); max 2 files in `references/`
- No `shared/` directory, no JSON state files
- Scripts only for deterministic checks or conversions with fixed output (Node, so they run on
  macOS and Windows). Never for reading/editing roadmap or spec files: those are small and the
  model handles them; a script there is how v1 regrew
- Hooks and scripts must work on Windows too (e.g. `npx` is `npx.cmd` there)
- A rule that needs a second paragraph of exceptions is a sign to cut it, not to extend it
- Check: `wc -l skills/*/SKILL.md`

## Conventions

- Skill and agent files: English. Runtime output follows the user's language setting.
- Lean on native Claude Code features (plan mode, subagents, `/simplify`, `/security-review`,
  AGENTS.md loading) instead of rebuilding them.
- Never push without the user's explicit OK (enforced by `hooks/push-guard.cjs`).
- Validate after edits: `claude plugin validate .` and `node hooks/push-guard.test.cjs`; in a
  session `/reload-plugins`.

## Evals

`evals/<case>/` holds `claude plugin eval` cases (fixture.sh + case.yaml + prompt.md + graders),
tagged per skill. Runs are non-interactive: test routing, files, tool calls and safety rules,
not flows that need a human answer. Cheap run for one skill (what `/improve` uses):

```bash
claude plugin eval . --trust-plugin --scaffold --allow-tools Bash Write Edit EnterPlanMode ExitPlanMode \
  --runs 1 --ablation none --no-publish --threshold 0 --max-cost-usd 3 --tag <skill>
```

Full check with the no-plugin baseline (after a model release, or monthly): drop `--runs 1
--ablation none --tag`, raise `--max-cost-usd`. A case whose Δ is ~0 means the skill line it
tests adds nothing: candidate for deletion. Every fixed behaviour bug gets a regression case
first (see `skills/improve`). Results land in `evals/results/` (gitignored).
