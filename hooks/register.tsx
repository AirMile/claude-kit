import type {
  EngineInterface,
  Register,
  SessionMessage,
  SessionUsage,
} from "claude-code";

import { feedbackInbox, feedbackTool } from "./feedback-inbox";
import { freshStart, freshTool } from "./fresh-start";
import { roadmapOpen, roadmapTool } from "./roadmap-open";
import {
  roadmapEdited,
  roadmapStale,
  roadmapUsage,
  roadmapView,
} from "./roadmap-view";
import type { Usage } from "./roadmap-parts";
import { branchSlug, inRoot, parseSpec, type SpecState } from "./spec";
import { themeTool, themeView } from "./theme-view";

// kit's context mod. Reads the active spec (slug from the feat/ or fix/ branch); never writes.
// - After a compaction: appends the spec's state, so the next turn re-reads it from disk.
// - Context and plan limits as one line in the roadmap pane's dashboard (USAGE).
// - The roadmap and theme panes: tools the skills call with data (roadmap-view, theme-view);
//   the roadmap pane also opens itself in a project with docs/roadmap.md (roadmap-open).
// - fresh_start: /build's safe point clears the chat and resumes (fresh-start).
// - feedback: the Skill Feedback inbox, and its status line in a kit checkout (feedback-inbox).

type Spec = SpecState & { slug: string };
type Figures = Pick<SessionUsage, "context" | "rateLimits">;
type Meter = Usage;

const SPEC_PATH = /docs\/specs\/[^/]+\.md$/;

let meters: Meter[] = [];

async function activeSpec($: EngineInterface): Promise<Spec | null> {
  const git = await $.process
    .run(["git", "symbolic-ref", "--short", "HEAD"], {
      cwd: await $.session.root(),
    })
    .catch(() => null);
  const slug = git?.exitCode === 0 ? branchSlug(git.stdout) : null;
  const text = slug
    ? await $.fs
        .read(inRoot(await $.session.root(), `docs/specs/${slug}.md`))
        .catch(() => null)
    : null;
  const state = parseSpec(text);
  return slug && state ? { slug, ...state } : null;
}

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
    ["five_hour", "session"],
    ["seven_day", "week"],
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
  roadmapUsage(meters);
  $.ui.invalidate("ui.render");
}

export const register: Register = (on) => {
  roadmapView(on);
  roadmapOpen(on);
  themeView(on);
  freshStart(on);
  feedbackInbox(on);

  on("session.start", async ($, e, next) => {
    const started = await next(e);
    await $.tool.register(roadmapTool);
    await $.tool.register(themeTool);
    await $.tool.register(freshTool);
    await $.tool.register(feedbackTool);
    await refresh($);
    return started;
  });

  // A /clear fires no session.start or measure until the next turn: drop the old context
  // figure now, or the dashboard keeps showing it in the fresh chat.
  on("session.end", async ($, e, next) => {
    if (e.reason === "clear") {
      meters = meters.filter((m) => m.label !== "ctx");
      roadmapUsage(meters);
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  on("session.measure", async ($, e, next) => {
    roadmapStale(); // the pane reloads git and specs on its next draw
    await refresh($, e);
    return next(e);
  });

  on("tool.call", { tool: ["Edit", "Write"] }, async ($, e, next) => {
    const ran = await next(e);
    if (SPEC_PATH.test(e.file_path.replace(/\\/g, "/"))) await refresh($);
    if (roadmapEdited(e.file_path)) $.ui.invalidate("ui.render");
    return ran;
  });

  on("session.compact", async ($, e, next) => {
    const compacted = await next(e);
    if (e.trigger === "precompute" || e.agentId || !compacted.messages)
      return compacted;
    const now = await activeSpec($);
    if (!now) return compacted;
    const note: SessionMessage = {
      role: "user",
      toolUses: [],
      text:
        `kit: building ${now.slug} · Status: ${now.status} · criteria ${now.done}/${now.total}. ` +
        `Re-read docs/specs/${now.slug}.md (## Handoff first) before continuing; ` +
        `if the /build procedure is no longer in context, run /build ${now.slug}.`,
    };
    return { ...compacted, messages: [...compacted.messages, note] };
  });
};
