import type {
  AgentSpawnInput,
  AgentSpawnResult,
  EngineInterface,
} from "claude-code";

import { flowSpawned } from "./flow";
import { log } from "./flow-store";
import { noteSpawned } from "./limit-queue";

// What every started subagent leaves behind, whichever way auto-model.ts's agent.spawn hook
// picked its model: the plan-limit pause tells it from a forked command, flow binds verifier and
// review evidence to it, and the log keeps its type and the model it runs on (/flow counts them:
// the baseline for picking helpers by model).
export async function spawnRecorded(
  $: EngineInterface,
  e: AgentSpawnInput,
  started: AgentSpawnResult,
): Promise<AgentSpawnResult> {
  if (started.deny !== undefined) return started; // refused: nothing started
  noteSpawned(started.agentId);
  await flowSpawned($, started.agentId, e.subagentType, e.prompt);
  await log($, {
    event: "spawn",
    text: e.subagentType,
    model: started.model,
    parent: e.parentModel,
    reason: e.resume ? "resume" : undefined,
  });
  return started;
}
