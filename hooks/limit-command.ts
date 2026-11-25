import type { CommandSpec, EngineInterface } from "claude-code";

import { getHold, limitInfo, limitPaused, resumeNow, setHold } from "./limit-guard";
import { hasKept, keptCount, sendingNow } from "./limit-queue";

export const limitCommand: CommandSpec = {
  name: "limit",
  description: "Control kit's plan-limit pause and keep warm",
  argumentHint: "[status|off|warm|pause|resume]",
  immediate: true,
};

const LABEL = { off: "Off", warm: "Warm", pause: "Limit" } as const;

const prompts = (n: number) => `${n} kept prompt${n === 1 ? "" : "s"}`;

// Never waits on the replay: it starts once this command has answered. The answers carry no
// "kit:" prefix, the engine puts the plugin name before a command's text.
export async function limitCommandRun($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase();
  if (arg === "resume") {
    if (sendingNow() && !limitPaused())
      return "a send is already under way; /limit status shows what is left.";
    const wasPaused = limitPaused();
    if (await resumeNow($)) return "resuming; what was kept is sent now.";
    return wasPaused ? "the pause ended; nothing was kept." : "nothing to resume.";
  }
  if (arg === "off" || arg === "warm" || arg === "pause") {
    await setHold($, arg);
    // Off and Warm end a pause and retry what a failed send left behind.
    if (arg !== "pause" && hasKept()) {
      const what = keptCount() ? prompts(keptCount()) : "the continue prompt";
      return `limit button: ${LABEL[arg]}; sending ${what}.`;
    }
  } else if (arg && arg !== "status") {
    return "Usage: /limit [status|off|warm|pause|resume]";
  }
  const hold = await getHold($);
  const info = await limitInfo($);
  const n = keptCount();
  const parts = [LABEL[hold], info, /queued|kept/.test(info) ? "" : `${n} kept`];
  return (
    `limit button: ${parts.filter(Boolean).join(" · ")}.` +
    (arg === "pause" ? " Limit pauses near the 5-hour limit, not at once." : "")
  );
}
