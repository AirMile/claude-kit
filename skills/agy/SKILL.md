---
name: agy
description: Run a Gemini model through the Antigravity CLI (`agy`) for an opinion, review, research or implementation. Use when the user asks for Gemini, agy, Antigravity or Google's model ("vraag Gemini", "laat agy meedenken", "ook aan agy"), or asks GPT and Gemini together.
allowed-tools: Bash(agy models), Bash(agy --version)
---

# Antigravity (Gemini)

Hand a task to a Gemini model through the `agy` CLI, so it runs on the user's Google plan
instead of this one's limits. This chat stays in charge: it writes the brief, reads the result
and judges it. `agy` shares no context with this chat.

Same recognition as `/codex`: the names `Gemini`, `agy` and `Antigravity` all mean this skill,
the way `GPT`, `Sol`, `Astra`, `Luna` and `Terra` mean `/codex`. "GPT en Gemini" / "GPT en agy" /
"alle modellen" → run both, blind to each other (briefs identical, neither sees the other's
answer), then compare. Never let one provider stand in for the other, and never report a name
you cannot run as "no access" before checking `which agy`.

## Models

`agy models` lists ids (`gemini-<version>-<family>-<effort>`, e.g. `gemini-3.8-flash-high`).
Use the newest Gemini version, a family the user named (Flash, Pro), else Flash. Effort:
`high` for research, plans and reviews, `low` for a quick search. The list also holds non-Gemini
models (Claude, GPT-OSS): use them only if the user asks for that exact model.

## Run

1. `agy --version` and `agy models`. Not installed, or `agy` asks for a login → tell the user
   (`agy` login is theirs; never read credentials).
2. Write the brief to a temp directory outside the project (`mktemp -d`), then run:

   ```sh
   agy --mode plan --add-dir "/absolute/project/path" --model MODEL_ID \
     --print="$(cat "$TMP/brief.md")" > "$TMP/agy.out" 2> "$TMP/agy.err"
   ```

   - The prompt must be attached to the flag (`--print='...'`): `--print --mode plan` takes
     `--mode` as the prompt and prints nothing useful. Stdin is not read as the prompt.
   - `--mode plan` is read-only: opinions, reviews, research, plans. Writing (`--mode
     accept-edits`) only when the user asked for an implementation. Never
     `--dangerously-skip-permissions`.
   - Read `$TMP/agy.out`; read `$TMP/agy.err` only on a failure. A run takes minutes: wait, don't poll.
3. Check after the run: `git status --short` before and after must match for a read-only run.

## Rules for every run

- **The brief stands alone**: goal, constraints, relevant paths, the checks to run, "follow the
  project's AGENTS.md", "answer in the user's language" and a short final report (findings or
  changes, checks with their result, open points).
- Agy commits, pushes and deploys nothing. One writing run at a time; edit none of the files it
  works on meanwhile.
- **Failure** (non-zero exit, empty answer, usage limit): tell the user why, then do the work
  here or ask. Never silently switch to another model or provider.
- **After**: an implementation → review `git diff` and run the checks yourself. Report what
  Gemini found or did apart from your own judgment, and apart from GPT's when both ran: where
  they agree, where not, which you take and why.
