---
name: codex
description: Run a GPT model through the Codex CLI for an opinion, review, research or implementation. Use when the user asks for GPT (Sol, Astra, Luna, Terra), or when kit's delegation sends work to Codex.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/codex-status.js)
---

# Codex

Hand a task to a GPT model through the Codex CLI, so it runs on the user's ChatGPT plan instead
of this one's limits. This chat stays in charge: it writes the brief, reads the result and judges
it. Codex shares no context with this chat.

## Models

Families, not versions: **Luna** (fast, cheap), **Terra** (balanced), **Sol** (the workhorse),
**Astra** (frontier, costly: only when the user names it). The newest version of a family in
Codex's own catalog is used, so a new release needs no change here. Never let one family stand
in for another.

## With `mcp__kit__delegate` (the usual way)

Call it with a `role` (`search`, `research`, `build`, `build+`, `review`, `plan`) and a brief.
The user named a model → add `family` (`sol`, `terra`, `luna`, `astra`). A follow-up on the same
run → `thread` from its answer. The tool runs Codex, keeps its log out of this chat and returns
the final message and changed files. A Claude route in its answer → run it with the Agent tool
as it says.

## Without the tool (Codex host, or an old kit)

1. `node ${CLAUDE_SKILL_DIR}/scripts/codex-status.js`: prints `argv` (how to start Codex here),
   the visible `models` and the ChatGPT `limits`. `error` → tell the user (install the Codex
   CLI, or `codex login` with ChatGPT; never read credentials, never fall back to an API key).
2. Pick the newest `gpt-<version>-<family>` id of the family; write the brief to a temp file.
3. Run, with `argv` in place of `codex`:

   ```sh
   codex exec --json --model MODEL_ID --sandbox read-only --skip-git-repo-check \
     -C "/absolute/project/path" - < brief.md 2> codex.log
   ```

   Read only the last `agent_message` of stdout; keep stderr (the whole run) in the log and read
   its tail only on a failure. A review runs the same way, read-only, with a brief that asks
   for findings on the uncommitted changes (`codex review --uncommitted` takes no brief).

## Rules for every run

- **The brief stands alone**: goal, constraints, relevant paths, the checks to run, "follow the
  project's AGENTS.md", and a short final report (what it found or changed, checks with their
  result, open points).
- **Sandbox**: read-only for opinions, reviews, research and plans. Writing only when the user
  asked for an implementation, or the band's GPT switch is on (its standing request).
  Codex commits, pushes and deploys nothing.
- **Long runs**: wait for the end; don't poll. Edit none of the files Codex works on meanwhile;
  one writing run at a time.
- **Failure** (non-zero exit, empty answer): tell the user why (login, Codex's own usage limit,
  an error), then do the work here or ask.
- **After**: an implementation → review `git diff` and run the checks yourself. Report what GPT
  found or did apart from your own judgment: where you agree, where not, why.
