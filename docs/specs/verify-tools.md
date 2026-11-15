<!-- format: kit spec. Status: defined → building → verifying → manual → done.
Criteria are checked [x] when built AND verified. -->

# verify-tools

Status: done
Design: —

## Goal

An agent can verify its own work with deterministic tools in every ecosystem a project uses,
without the mod guessing: `/setup` detects the tools once and writes them into `AGENTS.md §
Commands`, `task-readiness` makes the check for each criterion explicit before work starts,
and `/build`, `/launch` and `/audit` run the security and quality commands against a baseline.
Increment 2 of 2 (after `verify-evidence`). Two Vault skills of this week come in: `task-readiness`
and `distill-skill`. `port-react-page-to-angular` stays in the Lely repo (paths and ports).

## Acceptance criteria

- [x] Happy: `skills/setup/scripts/detect-tools.js <dir>` prints fixed `Test:`, `Lint/typecheck:`,
      `Build:`, `Security:`, `Quality:` lines for JS/TS, Angular, Python, Go, Rust, Java/Kotlin,
      .NET and PHP, only for tools a manifest or a local install shows; it runs and installs
      nothing, works on Windows paths, and prints nothing for an unknown project.
- [x] Happy: `/setup` fills those lines into `AGENTS.md § Commands` (the template gains
      `Security:` and `Quality:`) and leaves existing lines untouched.
- [x] Happy: `task-readiness` skill (≤ 100 lines): `/build` 4a runs it for Features; its Verify
      line becomes "criterion → exact command" and a check counts once seen failing on the
      current state; `distill-skill` is added with kit's frontmatter, English, ≤ 100 lines.
- [x] Happy: `/build` Verify, `/launch` Checks and `/audit` run `Security:`/`Quality:` when set:
      new findings against the baseline are improvement notes (`/build`), a blocker for `Security:`
      and one report line for `Quality:` (`/launch`), one report line (`/audit`). Unset → skipped.
- [x] Edge: `skills/build/SKILL.md` stays ≤ 200 lines (196 now), `setup` ≤ 150, others ≤ 150;
      `claude plugin validate .` and `claude plugin test .` pass; Codex gets any new Claude term.

## Out of scope

- A tool matrix as mod code, SAST or dead-code in the stop gate, auto-install, per-edit scans,
  requiring a security pass for V3 (later, on data).

## Approach

- `skills/setup/scripts/detect-tools.js` (new, Node, pure functions + CLI) with
  `detect-tools.test.js` on fixtures per ecosystem; `skills/setup/SKILL.md` + `agents-template.md`.
- `skills/task-readiness/SKILL.md` (new, from the Vault's 15 Nov version, kit wording);
  `skills/distill-skill/SKILL.md` (new, `disable-model-invocation`).
- `skills/build/SKILL.md` 4a and 5, `agents/verifier.md`, `skills/launch/SKILL.md` step 1,
  `skills/audit/SKILL.md` § 1: one short step each; build net ≤ 0 lines (compress elsewhere).
- README skill list, AGENTS.md layout line, `hooks/codex-context.md` if a term is new.

## Tests

- `detect-tools.test.js`: one fixture per ecosystem + empty + monorepo root with two.
- Evals: `evals/` case for `task-readiness` routing (stops before building without a check).
- `wc -l skills/*/SKILL.md`; `claude plugin validate .`; `claude plugin test .`.

## Open points

- Fallow or knip for `Quality:`: the script suggests whichever is in devDependencies, knip
  otherwise only when installed; Fallow verified (v3.43.1, MIT, runs on Next+Payload).
- gitleaks is a `Security:` command only; no per-edit scan (Astra/Gemini wanted one, Fable not).

## Handoff

Done 2026-11-16, not committed, branch feat/verify-evidence. detect-tools built by two `run_task`
briefs (GPT Sol 6.1); skills, wiring and README written here. A first review failed on a P1
(`bun test` instead of `bun run test`); fixed with 6 regression groups, then the second review
passed. Needs a version bump before the installed kit uses any of it (this and verify-evidence).
The test file is `.test.cjs` (like seo-facts), not `.test.js` as the spec said.

## Verify

2026-11-16 · suite 279 pass / 0 fail, detect-tools 61/61, push-guard 20/20, codex-hooks 10/10,
`claude plugin validate .` passes (license/icon notices pre-exist); build 195, setup 140 lines.
Eval `task-readiness-no-check` 1.00 (after fixing the eval's own system prompt).

- kit:verifier twice: 5/5; the second run added fixtures (bun, BOM, npm stub, Angular, `check
  --write`, Gradle with/without gradlew, .sln+csproj) and 4 mutations that each failed tests.
- Claude Sonnet review (author gpt): round 1 `verdict: fail` (P1 bun), round 2 `verdict: pass`.

- GPT Astra and Gemini (agy) reviews of the whole diff: both `verdict: fail`. Fixed after weighing
  against the code: a stale pass could close a newer failure (`failedAt`), the gate did not
  recognise `vendor/bin/…`, `dotnet format`, `mvn package`, `./gradlew assemble` that detect-tools
  prints, a solution file name was pasted unquoted into commands (injection), Angular test args were
  dropped. The Quality-is-no-blocker finding is a spec wording fix, not a code change.

Improvement notes (for Later) are on the roadmap.
