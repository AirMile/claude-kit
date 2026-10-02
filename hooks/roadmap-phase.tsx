import { card } from "./roadmap-card";
import { BAND, type Card, doneOf, type Parts } from "./roadmap-parts";

// The roadmap pane's phases: finished ones behind one "✓ <names>" line, then each open phase
// with its heading (press folds it; + Add), the add field and its cards. The heading shows
// the text as written in docs/roadmap.md ("Phase 1 · MVP", "v1.1 · Sharing", "Now"). Pure,
// like roadmap-parts.tsx.

export const DONE_PHASES = "\u0000done-phases"; // toggled key: show the finished phases

export function phases(p: Parts, names: string[]) {
  const finished = names.filter((ph) => {
    const cs = p.cards.filter((c) => c.phase === ph);
    return ph && cs.length > 0 && doneOf(cs) === cs.length;
  });
  const shown = p.toggled.has(DONE_PHASES);
  const line = finished.length ? (
    <p.el.Box key={DONE_PHASES} marginTop={1} paddingLeft={1}>
      <p.el.Button
        key={DONE_PHASES}
        plain
        dimColor
        label={shown ? "✓ hide finished phases" : `✓ ${finished.join(", ")}`}
        onPress={() => p.act.fold(DONE_PHASES)}
      />
    </p.el.Box>
  ) : null;
  return [
    line,
    ...names
      .filter((ph) => shown || !finished.includes(ph))
      .map((ph) => section(p, ph)),
  ];
}

// A phase's cards: done ones fold into one quiet "✓ n done" line above the open work (a
// finished phase shows them as they are, once unfolded).
function cards(p: Parts, phase: string, cs: Card[], complete: boolean) {
  const done = cs.filter((c) => c.state === "done");
  const open = cs.filter((c) => c.state !== "done");
  if (complete || !done.length) return cs.map((c) => card(p, c));
  const key = `done:${phase}`;
  const shown = p.toggled.has(key);
  return [
    <p.el.Box key={key} paddingLeft={1}>
      <p.el.Button
        key={key}
        plain
        dimColor
        label={shown ? "✓ hide done" : `✓ ${done.length} done`}
        onPress={() => p.act.fold(key)}
      />
    </p.el.Box>,
    ...(shown ? done.map((c) => card(p, c)) : []),
    ...open.map((c) => card(p, c)),
  ];
}

function section(p: Parts, phase: string) {
  const { Box, Button } = p.el;
  const cs = p.cards.filter((c) => c.phase === phase);
  const complete = doneOf(cs) === cs.length;
  // Open by default (finished phases wait behind the "✓ done" line); a dim heading = folded.
  const folded = !!phase && p.toggled.has(phase);
  return (
    <Box key={phase || "items"} flexDirection="column" gap={1} marginTop={1}>
      {phase ? (
        <Box
          justifyContent="space-between"
          backgroundColor={BAND}
          paddingX={1}
          paddingY={1}
        >
          {/* A Button is a leaf with a label: the whole heading text is that label. */}
          <Button
            key={`fold-${phase}`}
            plain
            dimColor={folded}
            label={phase}
            onPress={() => p.act.fold(phase)}
          />
          {p.draft || !p.ui ? null : (
            <Button
              key={`add-${phase}`}
              plain
              label={p.adding === phase ? "× Cancel" : "+ Add"}
              onPress={() => p.act.toggleAdd(phase, folded)}
            />
          )}
        </Box>
      ) : null}
      {p.adding === phase && !p.draft && p.ui ? (
        <p.ui.Input
          key={`new-${phase}-${p.added}`}
          autoFocus
          placeholder="Describe the feature in a few words"
          submitLabel="Add"
          onSubmit={(value) => p.act.add(phase, value)}
        />
      ) : null}
      {folded ? null : cards(p, phase, cs, complete)}
    </Box>
  );
}
