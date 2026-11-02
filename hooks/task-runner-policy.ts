// Task runner, pure: input, repair decisions and bounded results. The caller runs GPT and checks.

export const FIX_ROUNDS = 2;
export const TAIL_LINES = 60;
export const MAX_RESULT = 4000;
export const MAX_FINAL = 1500;
export const CHECK_MS = 10 * 60_000;
export const TOTAL_MS = 30 * 60_000;
export const MAX_CHECKS = 3;

export type RunInput = {
  brief: string;
  checks: string[][];
  role: "build" | "build+";
};

export function readRunInput(e: unknown): RunInput | string {
  if (!e || typeof e !== "object" || Array.isArray(e))
    return "Not run: input must be an object.";
  const { brief, checks, role = "build" } = e as Record<string, unknown>;
  if (typeof brief !== "string") return "Not run: the brief must be a string.";
  if (!brief.trim()) return "Not run: the brief is empty.";
  if (
    !Array.isArray(checks) ||
    checks.length < 1 ||
    checks.length > MAX_CHECKS ||
    ![...checks].every(
      (argv) =>
        Array.isArray(argv) &&
        argv.length > 0 &&
        [...argv].every((arg) => typeof arg === "string" && arg.length > 0),
    )
  )
    return `Not run: checks must be 1 to ${MAX_CHECKS} commands, each an argv array of strings.`;
  if (role !== "build" && role !== "build+")
    return "Not run: role must be build or build+.";
  return { brief: brief.trim(), checks, role };
}

export function tail(output: string, n = TAIL_LINES): string {
  const lines = output.split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  return n > 0 ? lines.slice(-n).join("\n") : "";
}

export type CheckResult = {
  argv: string[];
  code: number | null;
  output: string;
  error?: string; // could not start or timed out; supplied by the caller
};

export function fixBrief(failed: CheckResult): string {
  return (
    `Check \`${failed.argv.join(" ")}\` failed: exit ${failed.code}.\n\n` +
    `\`\`\`\n${tail(failed.output)}\n\`\`\`\n\n` +
    "Fix the cause in the code, not by weakening, skipping or deleting the check or its tests. " +
    "Stay within the original brief."
  );
}

export type RoundOutcome = "pass" | "fix" | "failing" | "stopped";

export function firstFailure(checks: CheckResult[]): CheckResult | undefined {
  return checks.find((check) => check.code !== 0);
}

export function nextStep(s: {
  checks: CheckResult[];
  fixRounds: number;
  codexError?: string;
  overDeadline: boolean;
}): RoundOutcome {
  if (
    s.codexError !== undefined ||
    s.overDeadline ||
    s.checks.some((check) => check.error !== undefined)
  )
    return "stopped";
  if (!firstFailure(s.checks)) return "pass";
  return s.fixRounds < FIX_ROUNDS ? "fix" : "failing";
}

export type Status = "pass" | "failing" | "stopped" | "not run";

function cut(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n[cut at ${limit} characters]`;
}

export function resultText(r: {
  status: Status;
  model?: string;
  thread?: string;
  rounds: number;
  files: string[];
  checks: CheckResult[];
  final: string;
  error?: string;
  verify?: number;
}): string {
  const header = [
    `run_task ${r.status}`,
    r.model ? `GPT ${r.model}` : "",
    r.thread ? `thread ${r.thread}` : "",
    `${r.rounds} rounds`,
  ]
    .filter(Boolean)
    .join(" · ");
  const lines = [
    header,
    `Changed: ${r.files.length ? r.files.join(", ") : "nothing"}`,
    ...r.checks.map(
      (check) =>
        `check \`${check.argv.join(" ")}\` → ${
          check.error !== undefined ? check.error : `exit ${check.code}`
        }`,
    ),
  ];
  if (r.status === "stopped")
    lines.push(`Stopped: ${r.error ?? "unknown error"}`);
  const remaining = ["Review the diff here before calling it done."];
  if (r.status === "pass" && (r.verify ?? 0) >= 2)
    remaining.push(
      "Then get an other-family review: mcp__kit__delegate role review, author gpt.",
    );
  if (r.status === "failing" || r.status === "stopped")
    remaining.push(
      "Never report this as passing: fix it here or hand a new brief" +
        (r.thread ? ` with thread ${r.thread}.` : "."),
    );

  let final = cut(r.final || "(empty)", MAX_FINAL);
  const failed = r.status === "failing" ? firstFailure(r.checks) : undefined;
  let output = failed ? tail(failed.output) : undefined;
  const render = () =>
    [
      ...lines,
      ...(output === undefined ? [] : [`\`\`\`\n${output}\n\`\`\``]),
      "--- final message ---",
      final,
      ...remaining,
    ].join("\n");

  // Keep the newest diagnostic text, then shorten the final if metadata leaves less room.
  let excess = render().length - MAX_RESULT;
  if (excess > 0 && output !== undefined) {
    output = output.slice(Math.min(excess, output.length));
    excess = render().length - MAX_RESULT;
  }
  if (excess > 0) {
    const budget = Math.max(0, final.length - excess - 40);
    final = cut(r.final || "(empty)", Math.min(MAX_FINAL, budget));
  }
  // Even unusually long paths, argv or identifiers must not displace status and guidance.
  excess = render().length - MAX_RESULT;
  if (excess > 0) {
    const all = [...lines, ...remaining];
    const budget = Math.max(
      40,
      Math.floor((all.join("\n").length - excess) / all.length),
    );
    const shorten = (line: string) => {
      if (line.length <= budget) return line;
      const left = Math.floor((budget - 1) / 2);
      return line.slice(0, left) + "…" + line.slice(-(budget - left - 1));
    };
    lines.splice(0, lines.length, ...lines.map(shorten));
    remaining.splice(0, remaining.length, ...remaining.map(shorten));
  }
  return render();
}
