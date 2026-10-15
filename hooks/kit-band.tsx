import type { On } from "claude-code";

import { getMode, setMode } from "./auto-model";
import { PROFILES, profileName } from "./model-policy";
import { openRoadmap } from "./roadmap-open";
import { PANE } from "./roadmap-view";
import { inRoot } from "./spec";

// The band above the prompt: a Roadmap button (in a project with docs/roadmap.md, while its
// pane is not open) and the model/effort profiles of auto-model.ts, the active one primary.
// It yields to a survey.

export function kitBand(on: On) {
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const { Box, Button, Text } = $.ui.resolve(e);
    const root = await $.session.root();
    const hasRoadmap = await $.fs
      .exists(inRoot(root, "docs/roadmap.md"))
      .catch(() => false);
    const panes = await $.ui.panes().catch(() => []);
    const isOpen = panes.some((p) => p.id === PANE && p.isPlaced);
    const now = await getMode($);
    return (
      <Box gap={1}>
        {hasRoadmap && !isOpen ? (
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
        {now === "off" ? <Text dimColor>off</Text> : null}
      </Box>
    );
  });
}
