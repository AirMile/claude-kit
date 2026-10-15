import type { CommandSpec, EngineInterface, On, ToolSpec } from "claude-code";

import type { Card } from "./roadmap-parts";
import { PANE, roadmapOpened } from "./roadmap-view";
import { inRoot } from "./spec";
import { list } from "./theme-view";

// Opens the roadmap pane (roadmap-view.tsx draws it): the tool /product calls, with items for
// a read-only draft (plan mode) or none for docs/roadmap.md live. It never opens on its own:
// the band's Roadmap button (kit-band.tsx) and /panel open it by hand, /panel anywhere
// (without docs/roadmap.md the pane says to run /product).

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

export const panelCommand: CommandSpec = {
  name: "panel",
  description: "Open kit's roadmap pane (project dashboard)",
  immediate: true,
};

// docs/product.md's `# <name>`, or "Dashboard" without one.
async function productName($: EngineInterface): Promise<string> {
  const root = await $.session.root();
  const text = await $.fs.read(inRoot(root, "docs/product.md")).catch(() => "");
  return /^# (.+)$/m.exec(String(text))?.[1]?.trim() || "Dashboard";
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

// The live roadmap, opened by a press or a command (asked, so placed at any width).
export function openRoadmap($: EngineInterface) {
  return show($, null);
}

export function roadmapOpen(on: On) {
  on("command.run", { command: "panel" }, async ($) => {
    const opened = await openRoadmap($);
    return {
      text: opened.isPlaced
        ? "Roadmap pane opened."
        : `Roadmap pane not shown (${opened.reason}).`,
    };
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
