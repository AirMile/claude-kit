// Flow's evidence, pure: which shell commands are checks (a test, typecheck, lint or build run,
// never a command that merely names one, like `echo test`), whether one passed (a pipe hides
// the exit code, so a piped check passes only when its output names no failure), and the
// worktree's fingerprint, a hash of what git shows changed (flow.ts runs git).

// A segment's own command, after `cd x &&`, env assignments, `time` and a package runner.
const PREFIX =
  /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:time\s+)?(?:(?:npx|bunx|pnpx)(?:\s+(?:-p\s+\S+|--package(?:=|\s+)\S+|-\S+))*\s+|(?:pnpm|yarn|bun)\s+(?:exec|dlx)\s+|uv\s+run\s+|poetry\s+run\s+)?/;

const RUNNER = new RegExp(
  "^(?:" +
    [
      "vitest",
      "jest",
      "mocha",
      "ava",
      "pytest",
      "tsc",
      "vue-tsc",
      "eslint",
      "biome",
      "ruff",
      "mypy",
      "pyright",
      "phpunit",
      "rspec",
      "playwright\\s+test",
      "cypress\\s+run",
      "(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:test|check|lint|typecheck|type-check|build|verify)(?::\\S+)?",
      "bun\\s+test",
      "cargo\\s+(?:test|check|clippy|build)",
      "go\\s+(?:test|vet|build)",
      "deno\\s+(?:test|check|lint)",
      "make\\s+(?:test|check|lint)",
      "dotnet\\s+test",
      "mvn\\s+(?:test|verify)",
      "\\.?/?gradlew?\\s+(?:test|check|build)",
      "swift\\s+test",
      "python3?\\s+-m\\s+(?:pytest|unittest|mypy)",
      "claude\\s+plugin\\s+test",
      "node\\s+\\S*\\.test\\.[cm]?[jt]s",
    ].join("|") +
    ")(?:\\s|$)",
);

// The commands joined by &&, || or ; one of which may be a check, each with its own pipe.
function segments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Check = { piped: boolean };

export function checkOf(command: string): Check | undefined {
  for (const seg of segments(command)) {
    const head = seg.split(/(?<!\|)\|(?!\|)/)[0] ?? "";
    const rest = head.replace(PREFIX, "");
    if (RUNNER.test(rest)) return { piped: head.length < seg.length };
  }
  return undefined;
}

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
