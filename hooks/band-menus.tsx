import type { EngineInterface } from "claude-code";

import { reset } from "./model-switch";

// The band's context menu (kit-band.tsx draws and opens it): Compact and Clear, then its name.

export type Menu = "usage" | "ctx";

export type MenuState = {
  ui: ReturnType<EngineInterface["ui"]["resolve"]>;
  done: () => void;
};

// Compact and clear run just after the press: inside it they can be refused.
function soon($: EngineInterface, work: () => Promise<unknown>) {
  $.clock.after(50, async () => {
    await work();
    $.ui.invalidate("ui.render");
  });
}

export function contextMenu($: EngineInterface, s: MenuState) {
  const { Box, Button, Text } = s.ui;
  const action = (kind: "compact" | "clear", label: string) => (
    <Button
      key={`kit-${kind}`}
      label={label}
      onPress={() => {
        s.done();
        soon($, () => reset($, kind));
      }}
    />
  );
  return (
    <Box gap={1}>
      <Box gap={1} flexWrap="wrap">
        {[action("compact", "⇲ Compact"), action("clear", "⌫ Clear")]}
      </Box>
      <Box flexShrink={0}>
        <Text dimColor>Context</Text>
      </Box>
    </Box>
  );
}
