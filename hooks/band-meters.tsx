import type { ElementTable, EngineInterface } from "claude-code";

import type { Meters } from "./delegate-policy";
import {
  PLAN_COLOUR,
  PLAN_NAME,
  PLANS,
  RING_SIZE,
  ringSvg,
} from "./band-rings";

// The band's plan meters, per window (5h, week). A terminal draws text: Claude's share with
// ChatGPT's dim beside it and Claude's time until reset (`5h 30%·2% 3h29m`). Every other
// surface draws a ring per window (band-rings.ts: Claude, ChatGPT and Gemini in one) with
// Claude's share and reset beside it, and on hover a table of all three with the GPT and Gemini
// switches. A plan switched off has no figures.

// One usage figure: "ctx 266k", "session 70% · 1h18m"; pct colors it from 60% and 85%.
export type Usage = {
  label: string;
  value: string;
  note?: string;
  pct: number;
};

type Ui = ReturnType<EngineInterface["ui"]["resolve"]>;
type DrawnUi = ElementTable<"desktop" | "vscode" | "mobile">;
export type MeterRow = {
  label: string;
  claude?: Usage;
  gpt?: Usage;
  gemini?: Usage;
};

const WINDOWS = ["5h", "wk"] as const;
const KINDS = [
  ["five_hour", "5h"],
  ["seven_day", "wk"],
] as const;

// The plans a switch turns on and off; Claude has none.
export type Switched = "gpt" | "gemini";
export type Switches = Record<Switched, boolean>;
const BOTH: Switches = { gpt: true, gemini: true };

export function untilReset(iso: string | undefined, now: number): string {
  const min = iso
    ? Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
    : 0;
  const [d, h, m] = [
    Math.floor(min / 1440),
    Math.floor(min / 60) % 24,
    min % 60,
  ];
  return d ? `${d}d${h}h` : h ? `${h}h${m}m` : `${m}m`;
}

// Another plan's windows as band figures, labelled `gpt 5h`, `gem wk`.
export function planMeters(
  plan: "gpt" | "gem",
  windows: Meters | undefined,
  now: number,
): Usage[] {
  return KINDS.flatMap(([kind, label]) => {
    const w = windows?.[kind];
    return w
      ? [
          {
            label: `${plan} ${label}`,
            value: `${Math.round(w.pct)}%`,
            pct: w.pct,
            note: untilReset(w.resetsAt, now),
          },
        ]
      : [];
  });
}

// Both windows before any plan reported: a drawing surface still shows its rings, whose table
// holds the switches.
export const NO_FIGURES: readonly MeterRow[] = WINDOWS.map((label) => ({
  label,
}));

// The two windows, each with whichever plan reported it, without a plan that is switched off.
export function meterRows(
  usage: readonly Usage[],
  on: Switches = BOTH,
): MeterRow[] {
  return WINDOWS.map((label) => ({
    label,
    claude: usage.find((u) => u.label === label),
    gpt: on.gpt ? usage.find((u) => u.label === `gpt ${label}`) : undefined,
    gemini: on.gemini
      ? usage.find((u) => u.label === `gem ${label}`)
      : undefined,
  })).filter((r) => r.claude || r.gpt || r.gemini);
}

// The terminal's line: `5h 30%·2% 3h29m`, GPT's share dim beside Claude's, then Claude's reset.
export function meterLine(ui: Ui, rows: readonly MeterRow[]) {
  const { Text } = ui;
  return rows
    .filter((r) => r.claude || r.gpt)
    .map((r) => (
      <Text key={`kit-usage-${r.label}`} wrap="truncate-end">
        <Text dimColor>{`${r.label} `}</Text>
        <Text bold>{r.claude?.value ?? "–"}</Text>
        {r.gpt ? <Text dimColor>{`·${r.gpt.value}`}</Text> : null}
        {r.claude?.note ? <Text dimColor>{` ${r.claude.note}`}</Text> : null}
      </Text>
    ));
}

// Per window its ring, with Claude's share and reset always in words beside it.
export function meterRings(ui: DrawnUi, rows: readonly MeterRow[]) {
  const { Box, Svg, Text } = ui;
  return rows.map((r) => (
    <Box
      key={`kit-usage-${r.label}`}
      gap={1}
      alignItems="center"
      flexShrink={0}
    >
      <Svg
        source={ringSvg({
          claude: r.claude?.pct,
          gpt: r.gpt?.pct,
          gemini: r.gemini?.pct,
        })}
        alt={`${r.label} used: ${PLANS.filter((p) => r[p])
          .map((p) => `${PLAN_NAME[p]} ${r[p]!.value}`)
          .join(", ")}`}
        width={RING_SIZE}
        height={RING_SIZE}
      />
      <Text>
        <Text dimColor>{`${r.label} `}</Text>
        <Text bold>{r.claude?.value ?? "–"}</Text>
        {r.claude?.note ? <Text dimColor>{` ${r.claude.note}`}</Text> : null}
      </Text>
    </Box>
  ));
}

// The rings in figures: a line per plan in its arc's colour, GPT's and Gemini's ending in the
// switch (shown also while off, so it can be turned on again).
export function usageTable(
  ui: Ui,
  rows: readonly MeterRow[],
  on: Switches,
  flip: (plan: Switched) => void,
) {
  const { Box, Button, Text } = ui;
  if (!rows.length) return null;
  return (
    <Box flexDirection="column">
      {PLANS.map((p) => (
        <Box key={`kit-plan-${p}`} gap={2} alignItems="center">
          <Box width={10} flexShrink={0}>
            <Text color={PLAN_COLOUR[p]}>{`● ${PLAN_NAME[p]}`}</Text>
          </Box>
          {rows.map((r) => (
            <Box key={`kit-plan-${p}-${r.label}`} width={16} flexShrink={0}>
              <Text>{`${r.label} ${r[p]?.value ?? "–"}`}</Text>
              {r[p]?.note ? <Text dimColor>{` ${r[p]!.note}`}</Text> : null}
            </Box>
          ))}
          {p === "claude" ? null : (
            <Button
              key={`kit-switch-${p}`}
              label={on[p] ? "on" : "off"}
              dimColor={!on[p]}
              onPress={() => flip(p)}
            />
          )}
        </Box>
      ))}
    </Box>
  );
}
