import type { RenderChildren } from "claude-code";

import { type Parts, phaseNames } from "./roadmap-parts";
import { phases } from "./roadmap-phase";
import { later } from "./roadmap-later";

// The roadmap pane (its title is the product): the roadmap on top, then the pad, a bordered block
// of kit's skills by stage of work (git state with Diff and Launch sits in Ship). Commit, compact
// and clear are in the band above the prompt (kit-band.tsx). Pure, like roadmap-parts.tsx.

export function body(p: Parts) {
  const { Box, Text } = p.el;
  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
      {p.note ? <Text color="#818cf8">{p.note}</Text> : null}
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
      {p.draft ? null : pad(p)}
    </Box>
  );
}

// The pad: one row per stage, its name on the left and its skills on the right. Setup leads
// while the project isn't set up; Diff and Launch show only when there is something for them.
function pad(p: Parts) {
  const { Box, Text, Button } = p.el;
  const g = p.git;
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
  const gitNote = g ? (
    <Text>
      <Text dimColor>{`${g.branch}  `}</Text>
      {g.changed ? (
        <Text>{`${g.changed} file${g.changed === 1 ? "" : "s"} changed`}</Text>
      ) : (
        <Text dimColor>clean</Text>
      )}
      {g.unpushed ? (
        <Text>{`  ·  ${g.unpushed} commit${g.unpushed === 1 ? "" : "s"} not live`}</Text>
      ) : null}
    </Text>
  ) : p.gitError ? (
    <Text dimColor>{`git: ${p.gitError}`}</Text>
  ) : null;
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
      {stage("Ship", gitNote, [
        g?.changed && p.hasDiff ? skill("diff", "Diff", "diff") : null,
        g?.unpushed ? skill("launch", "Launch", "kit:launch") : null,
        skill("audit", "Audit", "kit:audit"),
        skill("scan", "Scan", "kit:scan"),
      ])}
    </Box>
  );
}
