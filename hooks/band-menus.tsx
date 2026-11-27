import type { EngineInterface } from "claude-code";

import { setMode } from "./auto-model";
import {
  type Effort,
  effortLabel,
  EFFORTS,
  type Mode,
  PROFILES,
  profileName,
} from "./model-policy";
import { reset, setEffortLock } from "./model-switch";

// The band's own menus (kit-band.tsx draws and opens them). Profile: a row of profiles and a
// row of efforts under their names, the active one of each marked. A fixed effort only holds
// with the profile off, so picking one turns it off. Context: Compact and Clear, then its name.

export type Menu = "usage" | "profile" | "ctx";

// The profile as a circle that fills with the work it allows; empty for off.
export const PROFILE_MARK: Record<Mode, string> = {
  lean: "◔",
  balanced: "◑",
  quality: "●",
  off: "○",
};

const MODES: readonly Mode[] = ["off", ...PROFILES];
// The session's own effort (nothing fixed), then low to max.
const LEVELS: readonly (Effort | undefined)[] = [undefined, ...EFFORTS];
const EFFORT_NAME: Record<Effort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
};
const NAME_WIDTH = 8;

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

// A fixed effort holds only with the profile off (auto-model.ts), so a pick turns it off.
async function pickEffort($: EngineInterface, mode: Mode, level?: Effort) {
  await setEffortLock($, level);
  if (mode !== "off") await setMode($, "off");
  $.ui.invalidate("ui.render");
}

// `mode` is the profile, `effort` what main requests run at (undefined: the session's own).
export function profileMenu(
  $: EngineInterface,
  s: MenuState & { mode: Mode; effort: Effort | undefined },
) {
  const { Box, Button, Text } = s.ui;
  const choice = (
    key: string,
    label: string,
    active: boolean,
    pick: () => Promise<void>,
  ) => (
    <Button
      key={key}
      label={label}
      variant={active ? "primary" : "secondary"}
      onPress={() => {
        s.done();
        return pick();
      }}
    />
  );
  // Two cells high: a desktop's native button is taller than a text line, so one-cell rows
  // let the buttons of neighbouring rows touch.
  const row = (name: string, choices: unknown[]) => (
    <Box key={`kit-row-${name}`} gap={1} minHeight={2} alignItems="center">
      <Box width={NAME_WIDTH} flexShrink={0}>
        <Text dimColor>{name}</Text>
      </Box>
      <Box gap={1} rowGap={1} flexWrap="wrap">
        {choices as never}
      </Box>
    </Box>
  );
  return (
    <Box flexDirection="column">
      {row(
        "Profile",
        MODES.map((m) =>
          choice(
            `kit-mode-${m}`,
            `${PROFILE_MARK[m]} ${profileName(m)}`,
            m === s.mode,
            () => setMode($, m),
          ),
        ),
      )}
      {row(
        "Effort",
        LEVELS.map((level) =>
          choice(
            `kit-effort-${level ?? "default"}`,
            level ? `${effortLabel(level)} ${EFFORT_NAME[level]}` : "Default",
            level === s.effort,
            () => pickEffort($, s.mode, level),
          ),
        ),
      )}
      {s.mode === "off" ? null : (
        <Box gap={1}>
          <Box width={NAME_WIDTH} flexShrink={0} />
          <Text dimColor>Picking an effort turns the profile off</Text>
        </Box>
      )}
    </Box>
  );
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
