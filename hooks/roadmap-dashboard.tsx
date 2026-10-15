import type { RenderChildren } from "claude-code";

import { type Parts, phaseNames } from "./roadmap-parts";
import { phases } from "./roadmap-phase";
import { later } from "./roadmap-later";
import { changesTab, chatTab, tabRow } from "./roadmap-tabs";

// The dashboard pane (its title is the product): tabs (roadmap-tabs.tsx) over the shown one, and
// at the bottom the pad, a bordered block of kit's skills by stage of work, under every tab.
// Docked, the body is at least the pane's height and the tab fills it, so the pad sits at the
// bottom; a longer tab pushes it down. Chat and Changes: roadmap-tabs.tsx. A draft (plan mode) shows the roadmap alone. Commit,
// compact and clear are also in the band above the prompt (kit-band.tsx). Pure, like
// roadmap-parts.tsx.

export function body(p: Parts) {
  const { Box, Text } = p.el;
  return (
    <Box
      flexDirection="column"
      gap={1}
      paddingX={1}
      paddingY={1}
      minHeight={p.rows || undefined}
    >
      {p.draft ? null : tabRow(p)}
      {p.note ? <Text color="#818cf8">{p.note}</Text> : null}
      <Box flexDirection="column" flexGrow={1}>
        {p.draft || p.tab === "roadmap" ? roadmap(p) : null}
        {!p.draft && p.tab === "chat" ? chatTab(p) : null}
        {!p.draft && p.tab === "changes" ? changesTab(p) : null}
      </Box>
      {p.draft ? null : pad(p)}
    </Box>
  );
}

// The Roadmap tab: docs/roadmap.md live, or Make a roadmap.
function roadmap(p: Parts) {
  const { Box, Text } = p.el;
  return (
    <Box flexDirection="column" gap={1}>
      {p.hasRoadmap ? (
        <Box flexDirection="column" gap={1}>
          {phases(p, phaseNames(p))}
          {p.later.length || !p.draft ? later(p) : null}
        </Box>
      ) : (
        <Box gap={1} flexWrap="wrap">
          <Text dimColor>No docs/roadmap.md here.</Text>
          <p.el.Button
            key="make-roadmap"
            label="Make a roadmap"
            onPress={() => p.act.run("kit:product")}
          />
        </Box>
      )}
    </Box>
  );
}

// The pad: one row per stage, its name on the left and its skills on the right. Setup leads
// while the project isn't set up. Git state, Diff and Launch are in the Changes tab.
function pad(p: Parts) {
  const { Box, Text, Button } = p.el;
  const skill = (
    key: string,
    label: string,
    command: string,
    args = "",
    primary = false,
  ) => (
    <Button
      key={key}
      variant={primary ? "primary" : "secondary"}
      label={label}
      onPress={() => p.act.run(command, args)}
    />
  );
  const stage = (
    name: string,
    note: RenderChildren,
    skills: RenderChildren[],
  ) => (
    <Box key={`pad-${name}`} justifyContent="space-between" gap={2} flexWrap="wrap">
      <Text wrap="wrap">
        <Text dimColor>{name.padEnd(6)}</Text>
        {note}
      </Text>
      <Box gap={1} flexWrap="wrap">
        {skills}
      </Box>
    </Box>
  );
  return (
    <Box
      flexDirection="column"
      gap={1}
      borderStyle="round"
      borderColor="#334155"
      paddingX={1}
      paddingY={1}
    >
      {stage("Plan", null, [
        p.isSetUp ? null : skill("setup", "Setup", "kit:setup", "", true),
        skill("brainstorm", "Brainstorm", "kit:product", "brainstorm"),
        skill("critique", "Critique", "kit:product", "critique"),
        skill("intake", "Intake", "kit:intake"),
        skill("seo", "SEO", "kit:seo"),
        skill("theme", "Theme", "kit:theme"),
      ])}
      {stage("Make", null, [
        skill("convert", "Convert", "kit:convert"),
        skill("explain", "Explain", "kit:explain"),
        skill("lessons", "Lessons", "kit:lessons"),
      ])}
      {stage("Ship", null, [
        skill("audit", "Audit", "kit:audit"),
        skill("scan", "Scan", "kit:scan"),
      ])}
    </Box>
  );
}
