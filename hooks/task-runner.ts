import type { EngineInterface, On, ToolSpec } from "claude-code";

import {
  acquireWriter,
  FOOTER,
  releaseWriter,
  routeDelegation,
  runDelegated,
} from "./delegate-run";
import { flowCheckEnd, flowCheckStart, flowLevels } from "./flow";
import { isCheckArgv } from "./flow-check";
import {
  CHECK_MS,
  TOTAL_MS,
  firstFailure,
  fixBrief,
  nextStep,
  readRunInput,
  resultText,
  type CheckResult,
  type RunInput,
  type Status,
} from "./task-runner-policy";

// Until .claude-plugin/types/claude-code-mcp (generated, gitignored) lists the tool; written in
// the generator's own shape so the two declarations merge.
declare module "claude-code" {
  interface McpToolInputs {
    mcp__kit__run_task: {
      brief: string;
      checks: string[][];
      role?: "build" | "build+";
    };
  }
}

// mcp__kit__run_task: one GPT change and its host checks, repairing on the same thread.
// delegate-run shares routing and the writer lock; task-runner-policy bounds the loop/result.
const TOOL = "mcp__kit__run_task";

export const runTaskTool: ToolSpec = {
  name: "run_task",
  description:
    "kit: hand one change brief plus its covering check argv(s). The mod runs GPT's build, " +
    "runs the checks itself as the host user (no shell, session root), feeds a failing check " +
    "back to the same Codex thread up to 2 times, and returns one short result. " +
    "Review the diff afterwards. role: build (default) or build+ for a hard change.",
  inputSchema: {
    type: "object",
    properties: {
      brief: { type: "string" },
      checks: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "array", minItems: 1, items: { type: "string" } },
      },
      role: { type: "string", enum: ["build", "build+"] },
    },
    required: ["brief", "checks"],
  },
};

function notRun(reason: string) {
  return {
    result: `run_task not run · 0 rounds\n${reason.startsWith("Not run:") ? reason : `Not run: ${reason}`}`,
  };
}

function notice($: EngineInterface, toolUseId: string, text: string) {
  try {
    $.ui.notice(toolUseId, text);
  } catch {
    // the call's dialog is gone
  }
}

async function runTask($: EngineInterface, input: RunInput, toolUseId: string) {
  const began = await $.clock.now();
  const picked = await routeDelegation($, { role: input.role });
  if (picked.provider !== "gpt")
    return notRun(picked.provider === "claude" ? picked.why : picked.reason);
  if (!acquireWriter())
    return notRun("another GPT run that writes is still going.");

  const { r, argv } = picked;
  let status: Status = "stopped";
  let rounds = 0;
  let thread: string | undefined;
  let final = "";
  let error: string | undefined;
  let checks: CheckResult[] = [];
  let brief = input.brief;
  const files = new Set<string>();
  const notes: string[] = [];
  try {
    const root = await $.session.root();
    for (;;) {
      const left = TOTAL_MS - ((await $.clock.now()) - began);
      if (left <= 0) {
        error = `round ${rounds + 1}: total deadline reached`;
        break;
      }
      checks = []; // a round that stops before its checks shows none of the last round's
      notice($, toolUseId, `build · round ${rounds + 1}`);
      const { run, files: changed } = await runDelegated(
        $,
        r,
        argv,
        `${brief}\n\n${FOOTER[input.role]}`,
        toolUseId,
        thread,
        left,
      );
      rounds++;
      if (rounds === 1) thread = run.thread;
      final = run.answer;
      for (const file of changed) files.add(file);
      if (run.error) {
        error = `round ${rounds}: ${run.error}`;
        break;
      }
      notice($, toolUseId, `checks · round ${rounds}`);
      for (const check of input.checks) {
        if ((await $.clock.now()) - began >= TOTAL_MS) break;
        // Flow counts only what a Bash check would count: `["true"]` verifies nothing.
        const start = isCheckArgv(check) ? await flowCheckStart($) : undefined;
        const at = await $.clock.now();
        const timeoutMs = Math.min(CHECK_MS, TOTAL_MS - (at - began));
        if (timeoutMs <= 0) break;
        const result: CheckResult = { argv: check, code: null, output: "" };
        try {
          const ran = await $.process.run(check, { cwd: root, timeoutMs });
          result.code = ran.exitCode;
          result.output = ran.stdout + ran.stderr;
        } catch (err) {
          const timedOut =
            (await $.clock.now()) - at >= timeoutMs ||
            /timed?\s*out|timeout/i.test(String(err));
          result.error = timedOut
            ? `timed out after ${timeoutMs} ms`
            : `could not start: ${String(err)}`;
        }
        checks.push(result);
        if (start) {
          const note = await flowCheckEnd(
            $,
            start,
            result.code === 0 && !result.error,
          );
          if (note) notes.push(note);
        }
        if (result.error) break;
      }
      // Only a check the deadline skipped stops the run: one that passed right at it still counts.
      const overDeadline = checks.length < input.checks.length;
      const step = nextStep({ checks, fixRounds: rounds - 1, overDeadline });
      if (step !== "fix") {
        status = step;
        if (step === "stopped")
          error = `round ${rounds}: ${checks.find((check) => check.error)?.error ?? "total deadline reached"}`;
        break;
      }
      if (!thread) {
        error = `round ${rounds}: Codex returned no thread for repair`;
        break;
      }
      brief = fixBrief(firstFailure(checks)!);
    }
  } catch (err) {
    error = `round ${rounds + 1}: ${String(err)}`;
  } finally {
    releaseWriter();
  }
  const text = resultText({
    status,
    model: r.name,
    thread,
    rounds,
    files: [...files],
    checks,
    final,
    error,
    verify: (await flowLevels($).catch(() => undefined))?.v,
  });
  return notes.length ? { result: text, context: notes } : { result: text };
}

export function taskRunner(on: On) {
  on("tool.describe", { tool: TOOL }, async ($, e, next) => ({
    ...(await next(e)),
    isDeferred: false,
  }));
  // No tool.check allow: host checks need the normal permission prompt, outside Codex's sandbox.
  on("tool.call", { tool: TOOL }, async ($, e) => {
    const input = readRunInput(e);
    if (typeof input === "string") return notRun(input);
    return runTask($, input, e.tool_use_id);
  });
}
