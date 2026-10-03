<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# feedback-inbox

Status: defined
Design: —

## Goal

Skill Feedback points raised after a kit skill run, in any project, land in one machine-wide
inbox instead of living only in that chat. `/improve` reads them later in the kit repo, and a
status line there shows that points are waiting.

## Acceptance criteria

- [ ] Happy: `mcp__kit__feedback {action:"add", skill, text}` from any project stores the point
      (skill, text, project root, time) under its own `$.store` key, with no permission prompt,
      and answers `Recorded #<id> · <skill>: <n> open`.
- [ ] Happy: `{action:"list"}` (optional `skill`) returns open points oldest first, one line
      each: `#<id> · <skill> · <project dir name> · <YYYY-MM-DD> · <text>`;
      `{action:"done", ids}` removes them and answers how many were closed.
- [ ] Edge: adding a point whose skill + normalised text (trimmed, lower-case, whitespace
      collapsed) matches an open point stores nothing and names the existing id; `list` on an
      empty inbox answers `Inbox empty`; `done` with unknown ids closes none and names them.
- [ ] Happy: in a kit checkout (root `.claude-plugin/plugin.json` with `"name": "kit"`) with
      open points, the status line reads `kit: <n> feedback points · /improve <skill with most>`;
      it updates after `add`/`done` and is cleared at zero or outside a kit checkout.
- [ ] Error: unknown action, empty `skill`/`text`, `text` over 500 chars or `ids` not a string
      array → the result says what is wrong and nothing is stored; a failing `$.store` call →
      `kit: inbox unavailable (<reason>)`, never a thrown error.
- [ ] Happy: `improve` reads the skill's open points in step 0 (no skill argument → the skill
      with the most open points, instead of asking) and marks every point it acted on or
      declined `done` after its commit; the Skill Feedback rule in `~/.claude/CLAUDE.md`
      records each raised point with the tool.

## Out of scope

- Sync across machines (`$.store` is machine-local by design).
- A count in the roadmap dashboard, or a band, in other projects.
- Detecting friction automatically (a model call per turn); the model raises points as today.
- Editing skills from the inbox: that stays `/improve`, after approval.

## Approach

- `hooks/feedback.ts` (new, pure like `spec.ts`): `PREFIX = "feedback:"`, `Point` =
  `{ skill, text, project, at }`, `validate(input)`, `normalise`, `duplicate(points, p)`,
  `lines(points, skill?)`, `summary(points) → { count, top }`, `newId(now, rand)`.
- `hooks/feedback-inbox.ts` (new): the `feedback` ToolSpec (action `add | list | done`,
  `skill`, `text`, `ids`), `tool.check` allow, `tool.call` over `$.store.keys/get/set/delete`.
  One key per point (`feedback:<id>`), so parallel sessions never overwrite each other
  (docs: "Save from more than one session"). `inboxStatus($)`: kit checkout check via
  `$.fs.read` of the root manifest, then `$.ui.status(text | undefined)`.
- `hooks/register.tsx`: register the tool at `session.start`; replace `$.ui.status(undefined)`
  with `await inboxStatus($)`; wire `feedbackInbox(on)`.
- `skills/improve/SKILL.md`: step 0 (inbox as an observation source, default skill), step 5
  (close points after the commit). ≤ +3 lines.
- `AGENTS.md`: mod contract: it also writes `$.store` keys `feedback:*` (the inbox); layout
  line for the two files.
- `~/.claude/CLAUDE.md` § Skill Feedback (user file, not committed): "Record each raised point
  with `mcp__kit__feedback` (`add`)".
- Rejected: a markdown inbox in the kit repo. Writing there from another project means a
  permission prompt for a path outside the working dir, and it adds churn to the repo.

## Tests

- `hooks/feedback.test.ts` (new, `claude plugin test .`): validate (criterion 5 inputs),
  normalise + duplicate (3), lines ordering/format and `Inbox empty` (2, 3), summary top
  skill (4), newId uniqueness.
- Live session with `claude --plugin-dir .`: add/list/done round-trip incl. a duplicate and
  an invalid call (1, 2, 3, 5); status line in this repo vs `/tmp` project (4).
- Read `skills/improve/SKILL.md` + `~/.claude/CLAUDE.md` diff (6); `wc -l skills/*/SKILL.md`,
  scratch-dir `claude plugin validate` for the mod (AGENTS.md § Conventions).

## Handoff

—

## Verify

## Fixes
