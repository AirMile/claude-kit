import type { EngineInterface } from "claude-code";

import { GIT_ITEMS, gitAction } from "./git-menu";
import { EFFORTS } from "./model-policy";
import { reset, setEffortLock } from "./model-switch";

// The band's menus (kit-band.tsx draws and opens them): the effort (with the profile off), the
// context (Compact, Clear) and Git, each a row of choices beside its name.

export type Menu = "effort" | "ctx" | "git";

export type MenuState = {
  ui: ReturnType<EngineInterface["ui"]["resolve"]>;
  effort: string | undefined;
  done: () => void;
};

// Compact and clear run just after the press: inside it they can be refused.
function soon($: EngineInterface, work: () => Promise<unknown>) {
  $.clock.after(50, async () => {
    await work();
    $.ui.invalidate("ui.render");
  });
}

export function menuBody($: EngineInterface, m: Menu, s: MenuState) {
  const { Box, Button, Text } = s.ui;
  const { done } = s;
  // A line of a menu: its name in a narrow column, its choices beside it.
  const line = (name: string, items: unknown[]) => (
    <Box key={`kit-line-${name}`} gap={1}>
      <Box width={8} flexShrink={0}>
        <Text dimColor>{name}</Text>
      </Box>
      <Box gap={1} flexWrap="wrap">
        {items as never}
      </Box>
    </Box>
  );

  let body = null;
  if (m === "effort") {
    const levels = ["default", ...EFFORTS] as const;
    body = (
      <Box flexDirection="column" flexGrow={1} gap={1}>
        {line(
          "Effort",
          levels.map((l) => (
            <Button
              key={`kit-effort-${l}`}
              label={l === "default" ? "Default" : l}
              dimColor={(s.effort ?? "default") !== l}
              onPress={() => {
                void setEffortLock($, l === "default" ? undefined : l).then(
                  done,
                );
              }}
            />
          )),
        )}
      </Box>
    );
  } else if (m === "ctx") {
    body = (
      <Box flexDirection="column" flexGrow={1} gap={1}>
        {line("Context", [
          <Button
            key="kit-compact"
            label="⇲ Compact"
            onPress={() => {
              done();
              soon($, () => reset($, "compact"));
            }}
          />,
          <Button
            key="kit-clear"
            label="⌫ Clear"
            onPress={() => {
              done();
              soon($, () => reset($, "clear"));
            }}
          />,
        ])}
      </Box>
    );
  } else if (m === "git") {
    body = (
      <Box flexDirection="column" flexGrow={1} gap={1}>
        {line("Git", [
          <Button
            key="kit-git-Commit"
            label="✓ Commit"
            onPress={() => {
              done();
              void $.command
                .run({ command: "kit:commit" })
                .catch((err) =>
                  $.ui.toast(`kit: could not start /commit: ${String(err)}`),
                );
            }}
          />,
          ...GIT_ITEMS.map((g) => (
            <Button
              key={`kit-git-${g}`}
              label={g}
              onPress={() => {
                done();
                void gitAction($, g);
              }}
            />
          )),
        ])}
      </Box>
    );
  }

  return body;
}
