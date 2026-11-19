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
  // Node's built-in runner: flags (an operand only after import/require) before `--test`; -e/-p
  // never run it. The boundary is a lookahead: RUNNERS adds its own (?:\s|$).
  [
    "test",
    "node(?!(?:\\s+\\S+)*?\\s+(?:-h|--help|-v|--version|--v8-options|-c|--check|--completion-bash|--print-bash-completion|-e|--eval|-p|--print|-i|--interactive)(?=[\\s=]|$))(?:\\s+(?!--(?:eval|print|version|help|check)\\b)(?:--(?:import|require|loader|experimental-loader)(?:=\\S+|\\s+\\S+)|-r\\s+\\S+|--(?!(?:import|require|loader|experimental-loader)\\b)[\\w-]+(?:=\\S+)?))*\\s+--test(?=\\s|$)",
  ],
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
  find(command.replace(/^node\.exe(?=\s)/i, "node")) ??
  find(command.replace(/^yarn\s+/, ""));

const INFO_FLAG = /^--?(?:h|help|v|version|V)$/;

// Quoted strings and comments are text, not shell structure: `echo 'a && node --test'` runs no suite.
const blank = (command: string): string =>
  command
    .replace(/>\|/g, ">")
    // a string that starts with `-` keeps a marker: it may be a flag (`"--help"`); `"-!"` marks
    // an info flag (`"-h"`), which a forwarding runner hands on after its own `--`
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q) =>
      q[1] !== "-" ? '""' : INFO_FLAG.test(q.slice(1, -1)) ? '"-!"' : '"-"',
    )
    .replace(/(^|\s)#.*$/gm, "$1");

// The commands joined by &&, || or ; one of which may be a check, each with its own pipe.
// Even entries are commands, odd ones the operators between them.
const split = (command: string): string[] => command.split(/(&&|\|\||;|\n)/);

// A standalone `&` backgrounds a command, its status gone (`2>&1`, `&>f` and `&&` are not one).
const BACKGROUND = /(?<![&>|<])&(?![&>])/;
// An escaped separator is text, and a backslash-newline continues a line: neither is read here.
const ESCAPED = /\\[\s;&|#<>"'()$`]/;
// Syntax this reader does not follow (substitution, subshell, group, heredoc, a flag with a quote
// inside it): such a command gives no evidence, whatever it prints.
// Tested on the blanked command, so quoted text never counts; `DQUOTED` re-reads the double
// quotes, where `$(` and a backtick still substitute (single quotes are literal).
const EXOTIC = /`|\$\(|<<|[(){}]/;
const DQUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
const substitutes = (raw: string): boolean =>
  (raw.match(DQUOTED) ?? []).some((q) => q[0] === '"' && /`|\$[({]/.test(q));
// A flag led or glued by a quote (`"--help"`, `--he"lp"`) hides an info flag from the whitelist.
// Node reads flags anywhere, so its whole command is guarded; any other runner's words after its
// own bare `--` belong to the script (`npm test -- -t "-x"`) and are not.
// Read on the check's own blanked segment, where a quoted flag shows as `"-"` and a glued one
// as `--he""`.
const QUOTED_FLAG = /["']-|(?:^|[\s\\])-[\w-]*["']/;
const NODE_OWN = /^(?:yarn\s+)?node(?:\.exe)?(?:\s|$)/i;
const BARE_DASHES = /\s--(?:\s|$)/;
// npm, yarn, pnpm and bun hand the words after their own `--` to the script's runner, which
// prints help and exits 0 for an info flag. Only a whole-word quoted one (`"-!"`) or a word with a
// quote glued after its dash run (`--he"lp"`) masks; partly quoted words (`"--"help`), unquoted
// info flags and other no-run flags (`--listTests`) are not followed (see the spec's Known gaps).
const FORWARDS = /^(?:npm|pnpm|yarn|bun)\s/;
const QUOTED_INFO = /"-!"|(?:^|\s)-[\w-]*["']/;
// A quote left after pairing has no partner: bash stops with a syntax error and runs nothing.
// (The quote regex in `blank` is quadratic on a very long run of escaped quotes: no linear claim.)
const UNPAIRED = /["']/;
// `set -o pipefail` makes a pipeline's status the failing stage's: the pipe hides nothing.
const PIPEFAIL = /^\s*set\s+(?:-\w+\s+)*-\w*o\s+pipefail\s*(?:;|&&|\n)/;
const SETS = /\b(?:set|shopt)\b/g;

// `; echo <word>=$?` or `; echo $?` at the end: the status of the command before it, printed.
const STATUS_ECHO = /;\s*echo\s+(?:(\w+)=)?\$\?\s*$/;

export type Check = {
  piped: boolean;
  kind: CheckKind;
  kinds: CheckKind[];
  masked?: true; // the exit status is hidden by `;`, `||` or a branch: never a pass
  status?: string; // the word the command echoes before its status ("" for a bare `echo $?`)
};

// Joined by && only, every recognised segment ran when it passed: all their kinds count (and
// all open on a failure, since the output may not say which). With `||`, `;` or a newline
// only the first check counts, and it counts as a result only through the trailing status echo
// (`; echo exit=$?`): any other `;`/`||` after it, or `||` before it, masks its status.
export function checkOf(raw: string): Check | undefined {
  const command = blank(raw);
  const echo = STATUS_ECHO.exec(command);
  const body = echo ? command.slice(0, echo.index) : command;
  const all = !/\|\||;|\n/.test(body);
  const parts = split(body);
  const found: CheckKind[] = [];
  let piped = false;
  let masked = false;
  // A check's whole segment (its prefix too: `npx --ver"sion"`, `ADDOPTS="--x"`) and a shell
  // option setter (`set "-n"`); other commands (`echo "--- done ---"`) change nothing that runs.
  const quotedFlag = parts.some((p, i) => {
    if (i % 2 !== 0) return false;
    const own = p.trim().replace(PREFIX, "");
    if (!kindOf(own) && !/^\s*(?:set|shopt)\s/.test(p)) return false;
    if (NODE_OWN.test(own)) return QUOTED_FLAG.test(p);
    const t = p.trim();
    const [before = "", ...after] = own.split(BARE_DASHES);
    return (
      QUOTED_FLAG.test(t.slice(0, t.length - own.length) + before) ||
      (FORWARDS.test(own) && QUOTED_INFO.test(after.join(" ")))
    );
  });
  for (let i = 0; i < parts.length; i += 2) {
    const seg = (parts[i] ?? "").trim();
    const first = seg.split(/(?<!\|)\|(?!\|)/)[0] ?? "";
    const head = first.replace(/(\S)(&?[<>])/g, "$1 $2");
    const own = head.replace(PREFIX, "");
    const kind = kindOf(own);
    if (!kind) continue;
    found.push(kind);
    piped ||=
      first.length < seg.length &&
      !(PIPEFAIL.test(command) && (command.match(SETS)?.length ?? 0) === 1);
    masked ||= parts.some(
      (p, j) =>
        (j < i &&
          p === "||" &&
          // a ";" or newline ends the list, unless it only continues an operator
          !parts
            .slice(j + 1, i)
            .some(
              (q, k) =>
                (q === ";" || q === "\n") &&
                parts.slice(j + 1, j + 1 + k).some((r) => r.trim()),
            )) ||
        (j > i &&
          j % 2 === 1 &&
          p !== "&&" &&
          parts.slice(j + 1).some((q) => q.trim())),
    );
    if (!all) break;
  }
  masked ||=
    BACKGROUND.test(command) ||
    ESCAPED.test(raw) ||
    EXOTIC.test(command) ||
    substitutes(raw) ||
    quotedFlag ||
    UNPAIRED.test(command.replace(/""|"-!?"/g, ""));
  const [kind] = found;
  if (!kind) return undefined;
  const check: Check = { piped, kind, kinds: [...new Set(found)] };
  if (masked) check.masked = true;
  else if (echo) {
    // a pipe's echoed status is its last stage's, not the check's
    if (piped) check.masked = true;
    else check.status = echo[1] ?? "";
  }
  return check;
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
  /\b[1-9]\d* (?:failed|failing|errors?)\b|^\s*FAIL\b|\bFAILED\b|\bTests?:\s+\d+ failed|✗|✖|\berror TS\d+|\bError:|^#\s*fail\s+[1-9]/m;

// true: passed, false: failed, undefined: no evidence (a masked status, or an echo that shows
// none): the check is neither credited nor opened.
export function checkSettled(
  check: Check,
  isError: boolean,
  output: string,
): boolean | undefined {
  // A masked status proves no pass, but a pipe's own output can still show a failure.
  if (check.masked)
    return check.piped && FAILED.test(output) ? false : undefined;
  if (isError) return false;
  if (check.status !== undefined) {
    const last = output.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
    const shown = new RegExp(
      `^${check.status ? `${check.status}=` : ""}(\\d+)$`,
    ).exec(last);
    return shown ? shown[1] === "0" : undefined;
  }
  // A pipe hides the status: failure words show a failure, their absence proves nothing.
  if (check.piped) return FAILED.test(output) ? false : undefined;
  return true;
}

// The output without the status line a `; echo <word>=$?` added: it is no failure signature.
export function withoutStatus(check: Check, output: string): string {
  return check.status === undefined
    ? output
    : output.trimEnd().split(/\r?\n/).slice(0, -1).join("\n");
}

export const checkPassed = (
  check: Check,
  isError: boolean,
  output: string,
): boolean => checkSettled(check, isError, output) === true;

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
