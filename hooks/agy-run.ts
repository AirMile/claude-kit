import type { EngineInterface } from "claude-code";

import { AGY_MAX_BRIEF, type GeminiRoute, parseAgyModels } from "./delegate-policy";

// The Gemini side of mcp__kit__delegate: agy (Antigravity CLI) run headless with
// `--output-format json`, which prints one object at the end: conversation_id, status,
// response. The whole run stays in agy's own conversation; only the response is kept.
// Headless agy cannot ask for permission: a shell command or a file outside the workspace is
// denied and the run ends without an answer, which shows as an empty response.

const MAX_RUN_MS = 20 * 60_000;
const FIND =
  'command -v agy || for p in "$HOME/.local/bin/agy" /opt/homebrew/bin/agy /usr/local/bin/agy; do [ -x "$p" ] && echo "$p" && break; done';

export type AgyRun = {
  answer: string;
  conversation?: string;
  error?: string;
};

let cached: { path: string | null; models: string[]; at: number } | undefined;

// Where agy is and which models it lists, read at most every 10 minutes.
export async function agyStatus(
  $: EngineInterface,
): Promise<{ path: string | null; models: string[] }> {
  const now = await $.clock.now();
  // A missing agy is looked for again soon: the user may be installing it.
  if (cached && now - cached.at < (cached.path ? 10 * 60_000 : 30_000))
    return cached;
  let path: string | null = null;
  let models: string[] = [];
  try {
    const found = await $.process.run(["sh", "-c", FIND]);
    path = found.stdout.trim().split("\n")[0] || null;
    if (path) {
      const m = await $.process.run([path, "models"]);
      models = parseAgyModels(m.stdout);
    }
  } catch {
    path = null;
  }
  cached = { path, models, at: now };
  return cached;
}

export function agyArgs(
  path: string,
  r: GeminiRoute,
  root: string,
  brief: string,
  conversation?: string,
): string[] {
  return [
    path,
    "--mode",
    r.writes ? "accept-edits" : "plan",
    "--add-dir",
    root,
    "--model",
    r.model,
    "--output-format",
    "json",
    ...(conversation ? ["--conversation", conversation] : []),
    `--print=${brief}`,
  ];
}

export function tooLong(brief: string): string | undefined {
  return brief.length > AGY_MAX_BRIEF
    ? `The brief is ${brief.length} characters; agy takes it in its argument list, so at most ${AGY_MAX_BRIEF}. Shorten it, or point to files.`
    : undefined;
}

export function readAgy(stdout: string): AgyRun {
  const text = stdout.trim();
  const start = text.indexOf("{");
  try {
    const o = JSON.parse(start >= 0 ? text.slice(start) : text) as {
      conversation_id?: string;
      status?: string;
      response?: string;
      error?: string;
    };
    const ok = o.status === "SUCCESS";
    return {
      answer: o.response ?? "",
      conversation: o.conversation_id,
      ...(ok ? {} : { error: o.error ?? `agy status ${o.status ?? "unknown"}` }),
    };
  } catch {
    return { answer: "", error: text.slice(-500) || "agy printed nothing" };
  }
}

export async function runAgy(
  $: EngineInterface,
  argv: string[],
  root: string,
  show: (line: string) => Promise<void>,
  deadline = MAX_RUN_MS,
): Promise<AgyRun> {
  const stream = $.process.spawn({ argv, cwd: root });
  const started = await $.clock.now();
  let out = "";
  let err = "";
  let stop: (v: "stop") => void = () => {};
  const stopped = new Promise<"stop">((r) => (stop = r));
  const timer = $.clock.after(deadline, () => stop("stop"));
  for (;;) {
    const got = await Promise.race([stream.next(), stopped]);
    if (got === "stop") {
      void stream.return(undefined as never).catch(() => {});
      return { answer: "", error: `stopped after ${Math.round(deadline / 60_000)} min` };
    }
    if (got.done) break;
    if (got.value.stream === "stderr") err = (err + got.value.text).slice(-2000);
    else out += got.value.text;
    await show(`${Math.round(((await $.clock.now()) - started) / 1000)}s`);
  }
  timer.cancel();
  const end = await stream.result.catch(() => undefined);
  const run = readAgy(out);
  if (end?.code && !run.error)
    run.error = err.trim().split("\n").slice(-6).join("\n") || `exit code ${end.code}`;
  if (end?.signal && !run.error) run.error = `ended by ${end.signal}`;
  if (!run.answer.trim() && !run.error)
    run.error =
      "agy returned no answer (a command or a file outside the workspace is denied in headless mode)";
  return run;
}
