import type { EngineInterface, Register, SessionUsage } from "claude-code";

import { autoModel, modeCommand } from "./auto-model";
import { freshStart, freshTool } from "./fresh-start";
import { gptCached, gptOn, gptStatus } from "./codex-run";
import { delegateTool, delegation, gptCommand } from "./delegate";
import { flow, flowCommand, flowEdit, flowStop, resetFlow } from "./flow";
import { noteFile, resetChat } from "./chat-facts";
import { compaction } from "./compaction";
import { bandCommand, bandUsage, kitBand } from "./kit-band";
import { noteStop, warmCommand } from "./keep-warm";
import { noteLimits } from "./limit-guard";
import { panelCommand, roadmapOpen, roadmapTool } from "./roadmap-open";
import { roadmapEdited, roadmapStale, roadmapView } from "./roadmap-view";
import type { Usage } from "./roadmap-parts";
import { themeTool, themeView } from "./theme-view";

// kit's context mod. Reads the active spec; never writes.
// - Native compaction priorities and spec recovery (compaction.ts).
// - Context and plan limits as the band's second line (kit-band.tsx).
// - The roadmap and theme panes: tools the skills call with data (roadmap-view, theme-view);
//   the roadmap pane also opens on /panel (roadmap-open) and the band's button (kit-band).
// - Model and effort picked per prompt and per subagent from a profile (auto-model), chosen
//   in the band above the prompt or with /mode.
// - A pause before the plan limit runs out (limit-guard), and the cache kept warm while work
//   is open or, on Warm, while the chat is idle (keep-warm); the band's limit button or
//   /warm sets both per chat.
// - fresh_start: /build's safe point clears the chat and resumes (fresh-start).
// - delegate: work handed to Claude or GPT through Codex by role and room, ChatGPT's meters in
//   the band while GPT is on, /gpt (delegate).
// - flow: each change task's track, its notes and the check before a turn ends, /flow (flow).

type Figures = Pick<SessionUsage, "context" | "rateLimits">;
type Meter = Usage;

const SPEC_PATH = /docs\/specs\/[^/]+\.md$/;

let meters: Meter[] = [];

function untilReset(iso: string | undefined, now: number): string {
  const min = iso
    ? Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
    : 0;
  const [d, h, m] = [
    Math.floor(min / 1440),
    Math.floor(min / 60) % 24,
    min % 60,
  ];
  return d ? `${d}d${h}h` : h ? `${h}h${m}m` : `${m}m`;
}

async function refresh($: EngineInterface, figures?: Figures) {
  const usage = figures ?? (await $.session.usage());
  const pct = usage.context.percent;
  const now = await $.clock.now();
  meters = [
    {
      label: "ctx",
      pct: pct ?? 0,
      value: `${Math.round((usage.context.tokens ?? 0) / 1000)}k`,
    },
  ];
  for (const [kind, label] of [
    ["five_hour", "5h"],
    ["seven_day", "wk"],
  ] as const) {
    const rl = usage.rateLimits.find((r) => r.kind === kind);
    if (rl)
      meters.push({
        label,
        value: `${Math.round(rl.percentUsed)}%`,
        pct: rl.percentUsed,
        note: untilReset(rl.resetsAt, now),
      });
  }
  // ChatGPT's windows, as Codex last reported them, while GPT is on; read again at most every
  // 10 minutes.
  const on = await gptOn($);
  const gpt = on ? gptCached() : undefined;
  for (const [kind, label] of [
    ["five_hour", "gpt 5h"],
    ["seven_day", "gpt wk"],
  ] as const) {
    const w = gpt?.error ? undefined : gpt?.limits[kind];
    if (w)
      meters.push({
        label,
        value: `${Math.round(w.pct)}%`,
        pct: w.pct,
        note: untilReset(w.resetsAt, now),
      });
  }
  if (on) void gptStatus($);
  bandUsage(meters);
  $.ui.invalidate("ui.render");
}

export const register: Register = (on) => {
  roadmapView(on);
  roadmapOpen(on);
  themeView(on);
  freshStart(on);
  delegation(on);
  flow(on);
  autoModel(on);
  kitBand(on);
  compaction(on);

  on("session.start", async ($, e, next) => {
    const started = await next(e);
    await $.tool.register(roadmapTool);
    await $.tool.register(themeTool);
    await $.tool.register(freshTool);
    await $.tool.register(delegateTool);
    await $.command.register(panelCommand);
    await $.command.register(modeCommand);
    await $.command.register(warmCommand);
    await $.command.register(bandCommand);
    await $.command.register(gptCommand);
    await $.command.register(flowCommand);
    await refresh($);
    if (await gptOn($)) void gptStatus($).then(() => refresh($)); // without waiting
    return started;
  });

  // A /clear fires no session.start or measure until the next turn: drop the old context
  // figure now, or the dashboard keeps showing it in the fresh chat.
  on("session.end", async ($, e, next) => {
    if (e.reason === "clear") {
      resetChat();
      await resetFlow($);
      meters = meters.filter((m) => m.label !== "ctx");
      bandUsage(meters);
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  on("session.measure", async ($, e, next) => {
    roadmapStale(); // the pane reloads git and specs on its next draw
    await refresh($, e);
    await noteLimits($, e.rateLimits);
    return next(e);
  });

  // A main-chat turn ended: background work or a wake-up still to come keeps the cache warm.
  on("classic.Stop", async ($, e, next) => {
    const ran = await next(e);
    if (e.agent_id) return ran;
    const open = !!e.background_tasks?.length || !!e.session_crons?.length;
    // Flow holds a turn that ends with changes but no check; background work wakes it later.
    const hold =
      open || ran.block ? undefined : await flowStop($, e.last_assistant_message);
    if (hold) return { ...ran, block: hold };
    await noteStop($, open);
    return ran;
  });

  on("tool.call", { tool: ["Edit", "Write"] }, async ($, e, next) => {
    const ran = await next(e);
    if (!e.agentId) noteFile(e.file_path);
    if (SPEC_PATH.test(e.file_path.replace(/\\/g, "/"))) await refresh($);
    if (roadmapEdited(e.file_path)) $.ui.invalidate("ui.render");
    if (ran.deny !== undefined || ran.isError) return ran;
    // Flow: the change counts for the open task, a subagent's too; a note rides along when the
    // task grew.
    const note = await flowEdit($, e.file_path, !!e.agentId);
    return note ? { ...ran, context: [...(ran.context ?? []), note] } : ran;
  });
};
