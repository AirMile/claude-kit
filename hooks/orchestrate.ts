import type { EngineInterface } from "claude-code";

import type { Kind } from "./model-policy";

// Orchestrate, the band's ⑂ (off by default, kept in $.store): each typed prompt carries a note
// on where its work belongs, by the kind auto-model.ts sorted it into. This chat stays the
// orchestrator; self-contained, read-heavy or parallel work goes to subagents or, on the
// desktop app, its own session. Handing off is not free (a subagent starts cold and reads
// again), so a question gets no note and every note says when to keep the work here.

const STORE_KEY = "orchestrate";
let enabled: boolean | undefined; // read from $.store on first use

export async function isOrchestrating($: EngineInterface): Promise<boolean> {
  if (enabled === undefined)
    enabled = (await $.store.get(STORE_KEY).catch(() => undefined)) === true;
  return enabled;
}

export async function setOrchestrating($: EngineInterface, next: boolean) {
  enabled = next;
  await $.store.set(STORE_KEY, next).catch(() => {});
}

const KEEP =
  "Keep work in this chat when it depends on what was discussed here, is small, or needs the " +
  "user's answers; hand it off when it stands alone, reads many files, or can run in parallel.";

const NOTES: Record<Kind, string | undefined> = {
  question: undefined,
  routine:
    "kit orchestrate: do this here, unless it means searching many files: then send an " +
    `Explore subagent and keep only its conclusion. ${KEEP}`,
  planning:
    "kit orchestrate: send the research (reading code, docs, weighing options) to subagents " +
    `and keep the decision and the plan in this chat. ${KEEP}`,
  heavy:
    "kit orchestrate: split this into independent pieces; give each to a subagent, or on the " +
    "desktop app its own session, and use this chat to coordinate, merge and verify the " +
    `results. ${KEEP}`,
};

export const orchestrateNote = (kind: Kind): string | undefined => NOTES[kind];
