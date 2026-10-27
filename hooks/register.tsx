import type { EngineInterface, Register, SessionUsage } from "claude-code";

import { autoModel, modeCommand } from "./auto-model";
import { freshStart, freshTool } from "./fresh-start";
import { noteFile, resetChat } from "./chat-facts";
import { compaction } from "./compaction";
import { bandCommand, bandUsage, kitBand } from "./kit-band";
import { warmCommand } from "./keep-warm";
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
// - A pause before the plan limit runs out, with the cache kept warm until the reset
//   (limit-guard), and keep warm for an idle chat (keep-warm); the band's limit button or
//   /warm sets both per chat.
// - fresh_start: /build's safe point clears the chat and resumes (fresh-start).

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
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
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
    ["seven_day", "7d"],
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
  bandUsage(meters);
  $.ui.invalidate("ui.render");
}

export const register: Register = (on) => {
  roadmapView(on);
  roadmapOpen(on);
  themeView(on);
  freshStart(on);
  autoModel(on);
  kitBand(on);
  compaction(on);

  on("session.start", async ($, e, next) => {
    const started = await next(e);
    await $.tool.register(roadmapTool);
    await $.tool.register(themeTool);
    await $.tool.register(freshTool);
    await $.command.register(panelCommand);
    await $.command.register(modeCommand);
    await $.command.register(warmCommand);
    await $.command.register(bandCommand);
    await refresh($);
    return started;
  });

  // A /clear fires no session.start or measure until the next turn: drop the old context
  // figure now, or the dashboard keeps showing it in the fresh chat.
  on("session.end", async ($, e, next) => {
    if (e.reason === "clear") {
      resetChat();
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

  on("tool.call", { tool: ["Edit", "Write"] }, async ($, e, next) => {
    const ran = await next(e);
    if (!e.agentId) noteFile(e.file_path);
    if (SPEC_PATH.test(e.file_path.replace(/\\/g, "/"))) await refresh($);
    if (roadmapEdited(e.file_path)) $.ui.invalidate("ui.render");
    return ran;
  });
};
