import type { On } from "claude-code";

import { readChat, readMessages, remember } from "./chat-facts";
import { PANE, type Tab } from "./panel-parts";
import { pressOnFocus, tracked } from "./panel-press";
import { body } from "./panel-tabs";

// The dashboard pane, opened by /panel and the band's button (panel-open.ts): this chat's
// latest messages and the session's facts, both read on each draw. Drawing: panel-tabs.tsx.

let tab: Tab = "messages"; // the pane's shown tab

export function panelView(on: On) {
  pressOnFocus(on);
  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const chat = tab === "chat" ? await readChat($) : null;
    const messages = tab === "messages" ? await readMessages($) : null;
    return body({
      el: tracked($.ui.resolve(e), e.surface),
      tab,
      chat,
      messages,
      rows: e.props.placement === "dock" ? e.props.scroll.bodyRows : 0,
      act: {
        remember: (text) => void remember($, text),
        tab: (next) => {
          tab = next;
          $.ui.invalidate("ui.render");
        },
      },
    });
  });
}
