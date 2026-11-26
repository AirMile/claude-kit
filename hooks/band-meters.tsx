import type { ElementTable, EngineInterface } from "claude-code";

import {
  PLAN_COLOUR,
  PLAN_NAME,
  PLANS,
  RING_SIZE,
  ringSvg,
} from "./band-rings";
import type { Usage } from "./panel-parts";

// The band's plan meters, per window (5h, week). A terminal draws text: Claude's share with
// ChatGPT's dim beside it and Claude's time until reset (`5h 30%·2% 3h29m`). Every other
// surface draws a ring per window (band-rings.ts: Claude, ChatGPT and Gemini in one) with
// Claude's share and reset beside it, and on hover a table of all three. With GPT off:
// ChatGPT's figures are left out.

type Ui = ReturnType<EngineInterface["ui"]["resolve"]>;
type DrawnUi = ElementTable<"desktop" | "vscode" | "mobile">;
export type MeterRow = {
  label: string;
  claude?: Usage;
  gpt?: Usage;
  gemini?: Usage;
};

const WINDOWS = ["5h", "wk"] as const;

// The two windows, each with whichever plan reported it; with GPT off, without ChatGPT's.
export function meterRows(usage: readonly Usage[], gptOn = true): MeterRow[] {
  return WINDOWS.map((label) => ({
    label,
    claude: usage.find((u) => u.label === label),
    gpt: gptOn ? usage.find((u) => u.label === `gpt ${label}`) : undefined,
    gemini: usage.find((u) => u.label === `gem ${label}`),
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

// The rings in figures: a line per plan that reported, in its arc's colour.
export function usageTable(ui: Ui, rows: readonly MeterRow[]) {
  const { Box, Text } = ui;
  const lines = PLANS.filter((p) => rows.some((r) => r[p]));
  if (!lines.length) return null;
  return (
    <Box flexDirection="column">
      {lines.map((p) => (
        <Box key={`kit-plan-${p}`} gap={2}>
          <Box width={10} flexShrink={0}>
            <Text color={PLAN_COLOUR[p]}>{`● ${PLAN_NAME[p]}`}</Text>
          </Box>
          {rows.map((r) => (
            <Box key={`kit-plan-${p}-${r.label}`} width={16} flexShrink={0}>
              <Text>{`${r.label} ${r[p]?.value ?? "–"}`}</Text>
              {r[p]?.note ? <Text dimColor>{` ${r[p]!.note}`}</Text> : null}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
