import type { EngineInterface, On, ToolSpec } from "claude-code";

import type { Card } from "./roadmap-parts";
import { PANE, roadmapOpened } from "./roadmap-view";
import { inRoot } from "./spec";
import { list } from "./theme-view";

// Opens the roadmap pane (roadmap-view.tsx draws it): the tool /product calls, with items for
// a read-only draft (plan mode) or none for docs/roadmap.md live.

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

export function roadmapOpen(on: On) {
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
    const name = draft ? draft.product : await productName($);
    roadmapOpened(draft, name);
    // The pane is titled with the project's name (an open pane is retitled).
    const title = draft ? `${name} · draft` : name;
    const opened = await $.ui.open({ id: PANE, title });
    $.ui.invalidate("ui.render");
    return {
      result: opened.isPlaced
        ? "Roadmap pane shown."
        : `Roadmap pane not shown (${opened.reason}).`,
    };
  });
}
