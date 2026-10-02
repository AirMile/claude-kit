import * as file from "./roadmap-file";
import { edits, more, moves } from "./roadmap-card";
import { BAND, LATER, type Parts, phaseNames } from "./roadmap-parts";

// The roadmap pane's `## Later` block: fold it, add an idea, or move one back into a phase.
// Pure, like roadmap-parts.tsx.

export function later(p: Parts) {
  const { Box, Text } = p.el;
  const phases = phaseNames(p).filter(Boolean);
  const folded = p.toggled.has(LATER); // open by default; press the heading to fold
  return (
    <Box flexDirection="column" gap={1} marginTop={1}>
      <Box
        justifyContent="space-between"
        backgroundColor={BAND}
        paddingX={1}
        paddingY={1}
      >
        <p.el.Button
          key="fold-later"
          plain
          dimColor
          label="Later"
          onPress={() => p.act.fold(LATER)}
        />
        {p.draft || !p.ui ? null : (
          <p.el.Button
            key="add-later"
            plain
            label={p.adding === LATER ? "× Cancel" : "+ Add"}
            onPress={() => p.act.toggleAdd(LATER, folded)}
          />
        )}
      </Box>
      {p.adding === LATER && !p.draft && p.ui ? (
        <p.ui.Input
          key={`new-later-${p.added}`}
          autoFocus
          placeholder="An idea for later"
          submitLabel="Add"
          onSubmit={(value) => p.act.addLater(value)}
        />
      ) : null}
      {folded
        ? null
        : p.later.map((idea, index) => [
            <Box
              key={`later-${index}`}
              justifyContent="space-between"
              gap={2}
              paddingLeft={1}
            >
              <Text dimColor wrap="wrap">{`· ${idea}`}</Text>
              {phases.length ? more(p, `later-${index}`) : null}
            </Box>,
            moves(
              p,
              `later-${index}`,
              edits(
                p,
                phases.map((ph) => [
                  `→ ${ph}`,
                  `restored to ${ph}`,
                  (t) => file.restore(t, index, ph),
                ]),
              ),
            ),
          ])}
    </Box>
  );
}
