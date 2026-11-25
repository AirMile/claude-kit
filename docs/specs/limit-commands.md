<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# limit-commands

Status: manual
Design: —

## Goal

The plan-limit pause behaves correctly, and its Off/Warm/Limit button can be driven by text:
a cloud session on a phone draws no band, but command replies do show there (measured).

## Acceptance criteria

- [x] A failed keep-warm ping leaves the chat on Off, and the README says Off is the default
      and only Limit pauses — check: `claude plugin test .` (seen failing)
- [x] `/clear` or `/resume` during a pause ends it, drops the kept prompts and says so
      — check: `claude plugin test .` (seen failing)
- [x] kit registers no built-in name: `/kitcompact` replaces `/autocompact` and session start
      completes — check: `claude plugin test .` and the headless run under Verify (both seen failing)
- [x] A kept prompt leaves the queue only once it entered; a `drop` or reject keeps it and says
      so; no command hook waits on the replay — check: `claude plugin test .`
- [x] During a pause a skill or prompt command is kept and replayed as a command; a built-in
      that already ran is not replayed, and the chat says so; local commands pass untouched
      — check: `claude plugin test .` plus a live debug log of `/effort`, `/mode`, `/kit:commit`
- [ ] `/limit [status|off|warm|pause|resume]` answers in text, also while the chat is busy
      — check: `claude plugin test .`, a headless run, and the phone (manual)

## Out of scope

- Splitting kit into smaller plugins; drawing a band on mobile
- Releasing an effort lock without the band
- Pushing (needs Miles's explicit OK)

## Approach

- `hooks/limit-queue.ts` keeps what was held and sends it one at a time from `$.clock.after`; an
  item leaves only once it entered. `hooks/limit-command.ts` answers `/limit`.
- A skill or prompt command is held at `prompt.submit` and replayed with `$.command.run`. Built-in
  ones are known by the skill listing, plus `batch`, `debug` and `run-skill-generator`.
- A forked command raises no `prompt.submit`: kit sees a cut step of an agent that raised no
  `agent.spawn` while the command ran, and keeps it.
- What the host does and the test harness does not: `hooks/AGENTS.md`.

Known limits (accepted, not criteria):

- A plain prompt already on its way may still enter after `/clear`.
- A cut fork that had subagents of its own also sends the "continue" prompt.
- `/limit resume` right after a new pause refused the running send answers "resuming" although
  nothing goes out; a toast says so, a second resume sends it.
- A drop by another mod's `prompt.submit` hook above kit's is invisible for a replayed command.
- Kit's own hook never sees a text prompt it replays: no flow track or profile pick (as before).
- A built-in prompt command kit does not know is not kept; the chat says so.
- `/clear` inside the few ms kit looks a held command up lets that command into the new chat.
- A command that itself runs a forked command which is cut gets both kept.

## Handoff

Branch `fix/limit-commands` from `eac4ab1`, in the main checkout (the local kit reads this folder;
other sessions share it, so check `git status` first). All built, reviewed and verified;
version 0.16.6; committed, not pushed.
Next: push (needs Miles's explicit OK), then the manual check below, then merge. Cloud sessions get kit from GitHub: changes arrive there only after a push.

## Verify

- Baseline at `eac4ab1`: `claude plugin test .` 404 pass; `tsc --noEmit -p .` (5.6.3, see
  `hooks/AGENTS.md`) 76 errors; `node hooks/{push-guard,codex-hooks,fixtures-shellcheck}.test.cjs`
  pass; validate on a scratch copy passes.
- Final: 462 pass; tsc 78 (the 2 new ones in `hooks/limit-command.test.ts`); node tests and
  validate pass; headless `/kitcompact status` and `/limit status` skip no session start.
- Live (Claude Code 2.1.317, probe mods, a scratch copy of kit that pauses at 1%): local commands
  pass; prompts, skill, user and forked commands kept and replayed; a refused one stays kept;
  `/clear` drops them.
- Review: Claude reviews (first failed, fixed; later ones pass) and a GPT review of the final
  code: pass, its two P2s are under Known limits. `kit:verifier` passes criteria 1-5.
- Manual pending (criterion 6): on a phone cloud session after a push, `/limit`, `/limit warm`,
  `off`, `resume`, a bad argument, and `/limit status` while a long turn runs; each answers in text,
  the last before the turn ends.
