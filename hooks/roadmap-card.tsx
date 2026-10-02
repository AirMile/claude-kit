import * as file from "./roadmap-file";
import {
  COLOR,
  ICON,
  type Card,
  type Parts,
  phaseNames,
} from "./roadmap-parts";

// One feature on the roadmap pane: a done line, or a card with its /build step and its
// actions (↗ to pick up, ⋯ for the rest). Pure, like roadmap-parts.tsx.

// A spec's Status → the step it is on (define, build, verify) and what /build then does.
const STEP: Record<string, [number, string]> = {
  defined: [1, "Build"],
  building: [1, "Resume"],
  verifying: [2, "Verify"],
  manual: [2, "Verify"],
};
const STEPS = ["define", "build", "verify"];

export const goLabel = (c: Card, p: Parts) =>
  c.state === "progress"
    ? (STEP[p.specs[c.slug]?.status ?? ""]?.[1] ?? "Resume")
    : "Pick up";

export function card(p: Parts, c: Card) {
  const { Box, Text, Button } = p.el;
  const spec = p.specs[c.slug];
  const color = COLOR[c.state] ?? COLOR.open;
  // Done: one quiet line, aligned with a card's icon. The work is behind it.
  if (c.state === "done")
    return (
      <Box key={c.slug} justifyContent="space-between" gap={2} paddingLeft={3}>
        <Text dimColor wrap="wrap">
          <Text color={color}>{ICON.done}</Text>
          {"  "}
          <Text strikethrough>{c.slug}</Text>
          {`  ${c.description}`}
        </Text>
        {p.draft ? null : (
          <Button
            key={`explain-${c.slug}`}
            plain
            dimColor
            label="Explain"
            onPress={() => p.act.run("kit:explain", c.slug)}
          />
        )}
      </Box>
    );
  // One calm border for every open card. Not started: ↗ picks it up, ⋯ holds the rest. In
  // progress: its /build step, with the button to continue on that same line.
  return (
    <Box
      key={c.slug}
      flexDirection="column"
      borderStyle="round"
      borderColor="#334155"
      paddingX={2}
      paddingY={1}
    >
      <Text bold>{c.slug}</Text>
      {/* The actions sit bottom right, like an active card's button on its step line. */}
      <Box justifyContent="space-between" gap={2}>
        <Text dimColor wrap="wrap">
          {c.description}
        </Text>
        {p.draft || c.state !== "open" ? null : (
          <Box gap={2}>
            <Button
              key={`go-${c.slug}`}
              plain
              dimColor
              label="↗"
              onPress={() => p.act.build(c.slug)}
            />
            {c.editable ? more(p, c.slug) : null}
          </Box>
        )}
      </Box>
      {spec ? (
        <Box marginTop={1} justifyContent="space-between" gap={2}>
          <Box gap={2}>
            {STEPS.map((name, i) => {
              const at = STEP[spec.status]?.[0] ?? 0;
              return (
                <Text key={name} dimColor={i > at}>
                  <Text
                    color={i < at ? COLOR.done : i === at ? color : undefined}
                  >
                    {i < at ? "✓" : i === at ? "●" : "○"}
                  </Text>
                  {` ${name}`}
                  {i === 2 && i === at ? ` ${spec.done}/${spec.total}` : ""}
                </Text>
              );
            })}
          </Box>
          {p.draft ? null : (
            <Button
              key={`go-${c.slug}`}
              variant="secondary"
              label={goLabel(c, p)}
              onPress={() => p.act.build(c.slug)}
            />
          )}
        </Box>
      ) : null}
      {c.editable ? moves(p, c.slug, cardMoves(p, c)) : null}
    </Box>
  );
}

// ⋯ is a plain button; pressed, the card shows its actions as a row of small buttons, no
// dropdown. A move: label, the note after it, and the roadmap edit.
type Move = [string, string, (t: string) => string];
type Action = [string, () => void];

export const edits = (p: Parts, list: Move[]): Action[] =>
  list.map(([label, done, change]) => [label, () => p.act.edit(done, change)]);

export function more(p: Parts, key: string) {
  if (p.draft) return null;
  const isOpen = p.menuOpen === key;
  return (
    <p.el.Button
      key={`more-${key}`}
      plain
      dimColor={!isOpen}
      label={isOpen ? "×" : "⋯"}
      onPress={() => p.act.menu(key)}
    />
  );
}

export function moves(p: Parts, key: string, list: Action[]) {
  if (p.menuOpen !== key) return null;
  const { Box, Button } = p.el;
  return (
    <Box key={`moves-${key}`} gap={1} marginTop={1}>
      {list.map(([label, press]) => (
        <Button
          key={`${key}-${label}`}
          variant="secondary"
          label={label}
          onPress={press}
        />
      ))}
    </Box>
  );
}

function cardMoves(p: Parts, c: Card): Action[] {
  const list: Move[] = phaseNames(p)
    .filter((ph) => ph && ph !== c.phase)
    .map((ph) => [
      `→ ${ph}`,
      `moved ${c.slug} to ${ph}`,
      (t) => file.movePhase(t, c.slug, ph),
    ]);
  list.push([
    "→ Later",
    `moved ${c.slug} to Later`,
    (t) => file.toLater(t, c.slug),
  ]);
  const key = `remove:${c.slug}`;
  return [
    ...edits(p, list),
    [
      p.confirming === key ? "Remove?" : "Remove",
      () =>
        p.act.confirm(key, () =>
          p.act.edit(`removed ${c.slug}`, (t) => file.remove(t, c.slug)),
        ),
    ],
  ];
}
