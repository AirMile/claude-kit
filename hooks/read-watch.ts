import type { On } from "claude-code";

import { balance } from "./balance";
import { log } from "./flow-store";
import { countRead, isExplore, readBudget } from "./read-budget";

let reads = readBudget();

export function readTurn() {
  reads = readBudget();
}

export function readWatch(on: On) {
  on(
    "tool.call",
    { tool: ["Read", "Grep", "Glob", "Bash", "mcp__kit__delegate"] },
    async ($, e, next) => {
      const turn = reads;
      const started = e.tool === "mcp__kit__delegate" ? await $.clock.now() : 0;
      const ran = await next(e);
      const ended = e.tool === "mcp__kit__delegate" ? await $.clock.now() : 0;
      if (e.agentId || ran.deny !== undefined) return ran;
      if (e.tool === "mcp__kit__delegate") {
        const result =
          ran.text ?? (typeof ran.result === "string" ? ran.result : "");
        const first = result.split("\n")[0] ?? "";
        const provider = first.startsWith("GPT ")
          ? "gpt"
          : first.startsWith("Route: Claude")
            ? "claude"
            : "none";
        const outcome =
          !ran.isError &&
          (provider === "claude" ||
            (provider === "gpt" &&
              !first.includes(" failed:") && // the head line only: an answer may quote failures
              !first.includes("ended with:")))
            ? "ok"
            : "failed";
        if (
          turn === reads &&
          !ran.isError &&
          (provider === "claude" ||
            (provider === "gpt" && !first.includes(" failed:")))
        ) {
          turn.calls = 0;
          turn.chars = 0;
        }
        await log($, {
          event: "delegate",
          text: e.role ?? "unknown",
          provider,
          outcome,
          durationMs: ended - started,
        });
        return ran;
      }
      if (
        turn !== reads ||
        ran.isError ||
        !isExplore(e.tool, e.tool === "Bash" ? e.command : undefined)
      )
        return ran;
      const note = countRead(
        turn,
        (ran.text ?? "").length,
        balance(await $.clock.now()).leaning,
      );
      if (note)
        await log($, {
          event: "read-note",
          text: `${turn.calls} calls, ${turn.chars} chars`,
        });
      return note ? { ...ran, context: [...(ran.context ?? []), note] } : ran;
    },
  );
}
