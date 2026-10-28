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
      const ran = await next(e);
      if (e.agentId || ran.deny !== undefined) return ran;
      if (e.tool === "mcp__kit__delegate") {
        const first =
          (
            ran.text ?? (typeof ran.result === "string" ? ran.result : "")
          ).split("\n")[0] ?? "";
        const provider = first.startsWith("GPT ")
          ? "gpt"
          : first.startsWith("Route: Claude")
            ? "claude"
            : "none";
        await log($, {
          event: "delegate",
          text: `${e.role ?? "unknown"} ${provider}`,
        });
        return ran;
      }
      if (
        turn !== reads ||
        !isExplore(e.tool, e.tool === "Bash" ? e.command : undefined)
      )
        return ran;
      const note = countRead(turn, (ran.text ?? "").length, balance().leaning);
      if (note)
        await log($, {
          event: "read-note",
          text: `${turn.calls} calls, ${turn.chars} chars`,
        });
      return note ? { ...ran, context: [...(ran.context ?? []), note] } : ran;
    },
  );
}
