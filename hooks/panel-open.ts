import type { CommandSpec, EngineInterface, On } from "claude-code";

import { PANE } from "./panel-parts";
import { inRoot } from "./spec";

// Opens the dashboard pane (panel-view.tsx draws it). It never opens on its own: the band's
// button (kit-band.tsx) and /panel open it by hand.

export const panelCommand: CommandSpec = {
  name: "panel",
  description: "Open kit's dashboard pane (this chat's messages and session)",
  immediate: true,
};

// docs/product.md's `# <name>`, or "Dashboard" without one.
async function productName($: EngineInterface): Promise<string> {
  const root = await $.session.root();
  const text = await $.fs.read(inRoot(root, "docs/product.md")).catch(() => "");
  return /^# (.+)$/m.exec(String(text))?.[1]?.trim() || "Dashboard";
}

// Opened by a press or a command (asked, so placed at any width), titled with the project's
// name (an open pane is retitled); says whether a surface drew it.
export async function openPanel($: EngineInterface) {
  const title = await productName($);
  const opened = await $.ui.open({ id: PANE, title });
  $.ui.invalidate("ui.render");
  return opened;
}

export function panelOpen(on: On) {
  on("command.run", { command: "panel" }, async ($) => {
    const opened = await openPanel($);
    return {
      text: opened.isPlaced
        ? "Dashboard opened."
        : `Dashboard not shown (${opened.reason}).`,
    };
  });
}
