import { type Parts, phaseNames } from "./roadmap-parts";
import { phases } from "./roadmap-phase";
import { later } from "./roadmap-later";
import { chatTab, messagesTab, tabRow } from "./roadmap-tabs";

// The dashboard pane (its title is the product): tabs (roadmap-tabs.tsx) over the shown one.
// Session and Messages: roadmap-tabs.tsx. A draft (plan mode) shows the roadmap alone. The
// skills, commit, compact and clear are in the band above the prompt (kit-band.tsx, the ▤ and
// other menus). Pure, like roadmap-parts.tsx.

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
        {!p.draft && p.tab === "messages" ? messagesTab(p) : null}
      </Box>
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
