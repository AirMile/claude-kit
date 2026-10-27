---
name: codex
description: Run a GPT model through the Codex CLI for an opinion, review, research or implementation. Use when the user asks for GPT (Sol, Astra, Luna, Terra), or when a kit note (second opinion, orchestrate) sends work to Codex.
---

# Codex

Hand a task to a GPT model through the Codex CLI, so it runs on the user's ChatGPT plan instead
of this one's limits. This chat stays in charge: it writes the brief, reads the result and judges
it. Codex shares no context with this chat.

## Models

Map the name the user or the note gives; an explicit version first. An unknown name → ask.
Never switch to another model silently.

| Name             | Model ID        |
| ---------------- | --------------- |
| Astra, Astra 6   | `gpt-6-astra`   |
| Sol, Sol 6.1     | `gpt-6.1-sol`   |
| Luna, Luna 6     | `gpt-6-luna`    |
| Terra, Terra 5.6 | `gpt-5.6-terra` |
| Sol 6            | `gpt-6-sol`     |
| Sol 5.6          | `gpt-5.6-sol`   |
| Luna 5.6         | `gpt-5.6-luna`  |

## Before the first run in a chat

1. **Find the CLI**: `command -v codex` (Windows: `where codex`); on macOS also try
   `~/.local/bin/codex`. Not found → tell the user to install the Codex CLI, and stop.
2. **Check the login**: `codex login status` must say ChatGPT. Otherwise the user runs
   `codex login` themselves. Never read credentials, never fall back to an API key.

## Run

Write the brief to a temp file (the scratchpad when there is one), then:

```sh
codex exec --model MODEL_ID --sandbox read-only --ephemeral \
  --skip-git-repo-check -C "/absolute/project/path" - \
  < brief.md 2> codex.log
```

- **The brief stands alone**: goal, constraints, relevant paths, the checks to run, "follow the
  project's AGENTS.md", the answer in the user's language, and a short final report (what it
  found or changed, checks run with their result, open points).
- **Sandbox**: `read-only` for opinions, reviews and research. `workspace-write` only when the
  user asked for an implementation, or kit's Orchestrate is on `⑂ Codex` (its standing request).
  Codex commits, pushes and deploys nothing.
- **Read only stdout**: it is Codex's final message. stderr is its whole run (every command and
  its output): keep it in the log file and read its tail only when the run failed.
- **Long runs** (an implementation, research over many files): run in the background and wait
  for it to end; don't poll. Edit none of the files Codex works on meanwhile; one writing run
  at a time per set of files.
- **Failure** (non-zero exit, empty answer): read the log's tail, tell the user why (login,
  Codex's own usage limit, an error), then do the work here or ask.

## After

- An implementation: review `git diff` and run the checks yourself before calling it done.
- Report what GPT found or did apart from your own judgment: where you agree, where not, why.
