kit on Codex: kit's skills are written for Claude Code. Read their terms this way:

- `${CLAUDE_SKILL_DIR}` = the directory of the SKILL.md you loaded; `${CLAUDE_PLUGIN_ROOT}` = the
  kit root, two levels above it. Resolve both from that path, never from the project.
- AskUserQuestion → `request_user_input` when you have it; else ask in chat with numbered
  options (recommended first, one line why each), then end the turn and wait. multiSelect →
  the user may pick several.
- EnterPlanMode → read-only from here. ExitPlanMode → show the plan, end the turn, and act only
  after the user's explicit OK. An OK already given in this chat for that step still counts.
- "invoke the kit:<x> skill", "Skill tool", or a bare skill call (`commit feature=<slug>`,
  `lessons`) → read that kit skill's SKILL.md and follow it.
- The plugin's `verifier` agent → `spawn_agent` (fresh context, no fork of this chat) with:
  "Read and follow <kit root>/agents/verifier.md", plus the same inputs; then `wait_agent` and
  use its VERIFY block. Never check criteria or report them verified from your own checks.
  No `spawn_agent` → leave `Status: verifying` and say verification is pending.
- An Explore subagent or `model: sonnet` → a subagent on the default model.
- `mcp__kit__*` and `mcp__ccd_*` tools don't exist here: take the skill's "tool missing" path.
  `/clear` → `/new`; the `claude` CLI → `codex`; SendUserFile → give the file path.
- A kit command you tell the user (`/build <slug>`, `/kit:commit`) → `$kit:build <slug>`.
- `/simplify`, `/security-review` → suggest `/review`; skip `/doctor` suggestions.
- "Desktop worktree session" = a Codex app worktree. Never create worktrees yourself.
- Editing UI (components, CSS, layout) → first read `<kit root>/rules/frontend.md`.
- The `codex` skill (GPT through the Codex CLI) is for Claude Code: here, do that work yourself.
