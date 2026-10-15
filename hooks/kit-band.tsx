import type { On } from "claude-code";

import { getMode, runInfo, setMode } from "./auto-model";
import { PROFILES, profileName } from "./model-policy";
import { openRoadmap } from "./roadmap-open";
import { PANE } from "./roadmap-view";

// The band above the prompt: a Roadmap button (in any project, while its pane is not open:
// without docs/roadmap.md the pane is the dashboard alone) and the model/effort profiles of
// auto-model.ts, the active one primary, then the model and effort in use. It yields to a
// survey.

export function kitBand(on: On) {
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const { Box, Button, Text } = $.ui.resolve(e);
    const panes = await $.ui.panes().catch(() => []);
    const isOpen = panes.some((p) => p.id === PANE && p.isPlaced);
    const now = await getMode($);
    const info = await runInfo($);
    return (
      <Box gap={1} flexWrap="wrap">
        {!isOpen ? (
          <Button
            key="kit-roadmap"
            label="Roadmap"
            onPress={() => {
              void openRoadmap($).then(() => $.ui.invalidate("ui.render"));
            }}
          />
        ) : null}
        <Text dimColor>model:</Text>
        {PROFILES.map((p) => (
          <Button
            key={`kit-mode-${p}`}
            label={profileName(p)}
            variant={now === p ? "primary" : "secondary"}
            onPress={() => {
              void setMode($, now === p ? "off" : p);
            }}
          />
        ))}
        <Text dimColor>{now === "off" ? "off" : info}</Text>
      </Box>
    );
  });
}
