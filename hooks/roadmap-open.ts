import type { EngineInterface, On, ToolSpec } from "claude-code";

import type { Card } from "./roadmap-parts";
import { PANE, roadmapOpened } from "./roadmap-view";
import { inRoot } from "./spec";
import { list } from "./theme-view";

// Opens the roadmap pane (roadmap-view.tsx draws it): the tool /product calls, with items for
// a read-only draft (plan mode) or none for docs/roadmap.md live. The live pane also opens on
// its own in a project with docs/roadmap.md: at session start, and at the first prompt when the
// start could not seat it (unasked, a terminal needs 144 columns; a prompt counts as asked).

export const roadmapTool: ToolSpec = {
  name: "roadmap_view",
  description:
    "Open kit's roadmap pane. No items → it shows docs/roadmap.md live and editable. With " +
    "items → a read-only draft (plan mode): items in order, ## Later excluded; state open, " +
    "progress (spec linked, unchecked) or done; phase = the item's heading without '## '.",
  inputSchema: {
    type: "object",
    properties: {
      product: { type: "string" },
      items: list({
        slug: "string",
        description: "string",
        state: "string",
        phase: "string",
      }),
      later: { type: "array", items: { type: "string" } },
    },
  },
};

// docs/product.md's `# <name>`, or "Roadmap" without one.
async function productName($: EngineInterface): Promise<string> {
  const root = await $.session.root();
  const text = await $.fs.read(inRoot(root, "docs/product.md")).catch(() => "");
  return /^# (.+)$/m.exec(String(text))?.[1]?.trim() || "Roadmap";
}

// Opens the pane, a draft or the live roadmap; says whether a surface drew it.
async function show(
  $: EngineInterface,
  draft: { product: string; cards: Card[]; later: string[] } | null,
): Promise<{ isPlaced: boolean; reason?: string }> {
  const name = draft ? draft.product : await productName($);
  roadmapOpened(draft, name);
  // The pane is titled with the project's name (an open pane is retitled).
  const opened = await $.ui.open({
    id: PANE,
    title: draft ? `${name} · draft` : name,
  });
  $.ui.invalidate("ui.render");
  return opened;
}

// True while the pane opened at session start waits undrawn (terminal too narrow).
let waiting = false;

export function roadmapOpen(on: On) {
  // Show the live roadmap without a /product call, in a project with docs/roadmap.md only (a
  // user plugin runs everywhere; a pane elsewhere is noise). Not after /clear or a compaction,
  // so a pane the user closed by hand stays closed. (feedback-inbox.ts owns the matcher-less
  // classic.SessionStart; register.tsx owns session.start.)
  on(
    "classic.SessionStart",
    { source: /^(startup|resume)$/ },
    async ($, e, next) => {
      const started = await next(e);
      waiting = false;
      if (e.agent_type) return started;
      const root = await $.session.root();
      const has = await $.fs
        .exists(inRoot(root, "docs/roadmap.md"))
        .catch(() => false);
      if (has)
        waiting = !(await show($, null).catch(() => ({ isPlaced: true })))
          .isPlaced;
      return started;
    },
  );

  // The first prompt seats a pane that waited undrawn at session start (asked, so any width).
  on("prompt.submit", async ($, e, next) => {
    if (waiting) {
      waiting = false;
      await show($, null).catch(() => {});
    }
    return next(e);
  });

  on("tool.check", { tool: "mcp__kit__roadmap_view" }, () => ({
    decision: "allow",
  }));

  on("tool.call", { tool: "mcp__kit__roadmap_view" }, async ($, e) => {
    const input = e as unknown as {
      product?: string;
      items?: Card[];
      later?: string[];
    };
    const draft = Array.isArray(input.items)
      ? {
          product: input.product ?? "Roadmap",
          cards: input.items.map((i) => ({
            ...i,
            phase: i.phase ?? "",
            editable: false,
          })),
          later: input.later ?? [],
        }
      : null;
    const opened = await show($, draft);
    return {
      result: opened.isPlaced
        ? "Roadmap pane shown."
        : `Roadmap pane not shown (${opened.reason}).`,
    };
  });
}
