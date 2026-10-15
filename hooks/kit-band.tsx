import type { CommandSpec, On } from "claude-code";

import { getMode, runInfo, setMode } from "./auto-model";
import { isWarm, setWarm, warmCommandRun, warmInfo } from "./keep-warm";
import { limitInfo, resumeNow } from "./limit-guard";
import { PROFILES, profileName } from "./model-policy";
import { openRoadmap } from "./roadmap-open";
import { PANE } from "./roadmap-view";

// The band above the prompt: a Roadmap button (in any project, while its pane is not open:
// without docs/roadmap.md the pane is the dashboard alone) and the model/effort profiles of
// auto-model.ts, the active one primary, then the model and effort in use; while the plan
// limit holds this chat (limit-guard.ts), its pause and a Resume now button; Keep warm
// (keep-warm.ts). It yields to a survey. /band draws it again; /warm toggles keep warm.

export const bandCommand: CommandSpec = {
  name: "band",
  description:
    "Show kit's band above the prompt (Roadmap, model profiles, keep warm)",
  immediate: true,
};

export function kitBand(on: On) {
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const { Box, Button, Text } = $.ui.resolve(e);
    const panes = await $.ui.panes().catch(() => []);
    const isOpen = panes.some((p) => p.id === PANE && p.isPlaced);
    const now = await getMode($);
    const info = await runInfo($);
    const pause = await limitInfo($);
    const warm = isWarm();
    const warmed = warmInfo();
    return (
      // Roadmap sits at the right end: its pane opens on the right.
      <Box justifyContent="space-between" gap={2} flexWrap="wrap">
        <Box gap={1} flexWrap="wrap">
          <Text dimColor>model:</Text>
          {PROFILES.map((p) => (
            <Button
              key={`kit-mode-${p}`}
              label={profileName(p)}
              dimColor={now !== p}
              onPress={() => {
                void setMode($, now === p ? "off" : p);
              }}
            />
          ))}
          <Text dimColor>{now === "off" ? "off" : info}</Text>
          <Button
            key="kit-warm"
            label="Keep warm"
            dimColor={!warm}
            onPress={() => {
              void setWarm($, !warm);
            }}
          />
          {warmed ? <Text dimColor>{warmed}</Text> : null}
          {pause ? <Text color="#f59e0b">{pause}</Text> : null}
          {pause ? (
            <Button
              key="kit-resume"
              label="Resume now"
              onPress={() => {
                void resumeNow($);
              }}
            />
          ) : null}
        </Box>
        <Button
          key="kit-roadmap"
          label={isOpen ? "Close roadmap" : "Roadmap"}
          onPress={() => {
            const toggle = isOpen ? $.ui.close({ id: PANE }) : openRoadmap($);
            void toggle.then(() => $.ui.invalidate("ui.render"));
          }}
        />
      </Box>
    );
  });

  on("command.run", { command: "warm" }, async ($, e) => ({
    text: await warmCommandRun($, e.args),
  }));

  // There is no call that unfolds a band the person folded; a redraw is what a plugin has.
  on("command.run", { command: "band" }, async ($) => {
    $.ui.invalidate("ui.render");
    return {
      text: "kit band drawn above the prompt. Folded ([+])? ctrl+x ctrl+a unfolds it.",
    };
  });
}
