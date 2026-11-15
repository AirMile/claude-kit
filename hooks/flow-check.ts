// Flow's evidence, pure: which shell commands are checks (a test, typecheck, lint or build run,
// never a command that merely names one, like `echo test`), whether one passed (a pipe hides
// the exit code, so a piped check passes only when its output names no failure), and the
// worktree's fingerprint, a hash of what git shows changed (flow.ts runs git).

// A segment's own command, after `cd x &&`, env assignments, `time` and a package runner.
const PREFIX =
  /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:time\s+)?(?:(?:npx|bunx|pnpx)(?:\s+(?:-p\s+\S+|--package(?:=|\s+)\S+|-\S+))*\s+|(?:pnpm|yarn|bun)\s+(?:exec|dlx)\s+|uv\s+run\s+|poetry\s+run\s+)?(?:(?:\.\/)?vendor\/bin\/|node_modules\/\.bin\/)?/;

export type CheckKind = "test" | "static" | "build";

// Keep runner order: the first matching alternative supplies the kind.
const RUNNER: [CheckKind, string][] = [
  ["test", "vitest|jest|mocha|ava|pytest"],
  ["static", "tsc|vue-tsc|eslint|biome|ruff|mypy|pyright"],
  ["test", "phpunit|rspec|playwright\\s+test|cypress\\s+run"],
  ["test", "(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:test|verify)(?::\\S+)?"],
  [
    "static",
    "(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:check|lint|typecheck|type-check)(?::\\S+)?",
  ],
  ["build", "(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?build(?::\\S+)?"],
  ["test", "bun\\s+test|cargo\\s+test"],
  ["static", "cargo\\s+(?:check|clippy)"],
  ["build", "cargo\\s+build"],
  ["test", "go\\s+test"],
  ["static", "go\\s+vet"],
  ["build", "go\\s+build"],
  ["test", "deno\\s+test"],
  ["static", "deno\\s+(?:check|lint)"],
  ["test", "make\\s+test"],
  ["static", "make\\s+(?:check|lint)"],
  ["test", "dotnet\\s+test|mvn\\s+(?:test|verify)"],
  ["static", "dotnet\\s+format|mvn\\s+(?:checkstyle:check|spotbugs:check)"],
  ["test", "\\.?/?gradlew?\\s+(?:test|check)"],
  ["static", "\\.?/?gradlew?\\s+(?:detekt|checkstyleMain|ktlintCheck)"],
  ["build", "\\.?/?gradlew?\\s+(?:build|assemble)"],
  ["test", "swift\\s+test|python3?\\s+-m\\s+(?:pytest|unittest)"],
  ["static", "python3?\\s+-m\\s+mypy"],
  ["test", "claude\\s+plugin\\s+test|node\\s+\\S*\\.test\\.[cm]?[jt]s"],
  ["test", "ng\\s+test"],
  ["static", "ng\\s+lint|phpstan|psalm|phpcs|golangci-lint|staticcheck"],
  ["build", "ng\\s+build|dotnet\\s+build|mvn\\s+compile"],
  ["build", "mvn\\s+(?:-D\\S+\\s+)*package"],
];
const RUNNERS = RUNNER.map(
  ([kind, source]) => [kind, new RegExp(`^(?:${source})(?:\\s|$)`)] as const,
);
const find = (command: string): CheckKind | undefined =>
  RUNNERS.find(([, pattern]) => pattern.test(command))?.[0];
// `yarn vitest run` runs a binary without `exec`; `yarn add jest` is no check.
const kindOf = (command: string): CheckKind | undefined =>
  find(command) ?? find(command.replace(/^yarn\s+/, ""));

// The commands joined by &&, || or ; one of which may be a check, each with its own pipe.
function segments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Check = { piped: boolean; kind: CheckKind; kinds: CheckKind[] };

// Joined by && only, every recognised segment ran when it passed: all their kinds count (and
// all open on a failure, since the output may not say which). With `||`, `;` or a newline
// only the first check counts.
export function checkOf(command: string): Check | undefined {
  const all = !/\|\||;|\n/.test(command);
  const found: CheckKind[] = [];
  let piped = false;
  for (const seg of segments(command)) {
    const head = seg.split(/(?<!\|)\|(?!\|)/)[0] ?? "";
    const kind = kindOf(head.replace(PREFIX, ""));
    if (!kind) continue;
    found.push(kind);
    piped ||= head.length < seg.length;
    if (!all) break;
  }
  const [kind] = found;
  return kind ? { piped, kind, kinds: [...new Set(found)] } : undefined;
}

// An argv run without a shell (mcp__kit__run_task): its own command only, so `;` or `|` inside
// an argument never makes it a check.
export function checkKindOfArgv(
  argv: readonly string[],
): CheckKind | undefined {
  return kindOf(argv.join(" ").replace(PREFIX, ""));
}
export const isCheckArgv = (argv: readonly string[]): boolean =>
  checkKindOfArgv(argv) !== undefined;

// Words a failing run prints; a count of zero ("0 failed") is not a failure.
const FAILED =
  /\b[1-9]\d* (?:failed|failing|errors?)\b|^\s*FAIL\b|\bFAILED\b|\bTests?:\s+\d+ failed|✗|✖|\berror TS\d+|\bError:/m;

export function checkPassed(
  check: Check,
  isError: boolean,
  output: string,
): boolean {
  if (isError) return false;
  return !(check.piped && FAILED.test(output));
}

// FNV-1a, 32 bits, as hex: enough to tell one worktree state from another.
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Docs and plain text never need a check: the gate looks at code only.
export const DOCS_PATHSPEC = [
  ":(exclude,glob)**/*.md",
  ":(exclude,glob)**/*.txt",
  ":(exclude)docs",
  ":(exclude)doc",
];
