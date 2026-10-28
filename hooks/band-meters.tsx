import type { EngineInterface } from "claude-code";

import type { Band } from "./delegate-policy";
import type { Usage } from "./roadmap-parts";

// The band's plan meters: per window Claude's share and ChatGPT's beside it (`5h 30%·2%`), the
// times until reset in a card above the band while the pointer rests on the meters. Claude and
// GPT both stay in view on one short line; the card has the detail.

type Ui = ReturnType<EngineInterface["ui"]["resolve"]>;
export type MeterRow = { label: string; claude?: Usage; gpt?: Usage };

export const GPT_COLOR = "#4ade80";
export const METERS_SCOPE = "kit-meters";
const WINDOWS = ["5h", "wk"] as const;

// The two windows, each with whichever plan reported it.
export function meterRows(usage: readonly Usage[]): MeterRow[] {
  return WINDOWS.map((label) => ({
    label,
    claude: usage.find((u) => u.label === label),
    gpt: usage.find((u) => u.label === `gpt ${label}`),
  })).filter((r) => r.claude || r.gpt);
}

// The band's line: `5h 30%·2%`, GPT's share in its own colour.
export function meterLine(ui: Ui, rows: readonly MeterRow[]) {
  const { Text } = ui;
  return rows.map((r) => (
    <Text key={`kit-usage-${r.label}`} wrap="truncate-end">
      <Text dimColor>{`${r.label} `}</Text>
      <Text bold>{r.claude?.value ?? "–"}</Text>
      {r.gpt ? <Text color={GPT_COLOR}>{`·${r.gpt.value}`}</Text> : null}
    </Text>
  ));
}

const cell = (u: Usage | undefined) =>
  u ? `${u.value.padStart(4)} ${(u.note ?? "").padEnd(6)}` : "   –       ";

// The card the meters reveal: both plans per window with the time until reset, and the
// delegation balance (balance.ts).
export function meterCard(ui: Ui, rows: readonly MeterRow[], band: Band) {
  const { Box, Text } = ui;
  const gpt = rows.some((r) => r.gpt);
  return (
    <Box
      key="kit-menu-meters"
      flexDirection="column"
      alignItems="flex-start"
      paddingBottom={1}
      display="none"
      hover={{ scope: METERS_SCOPE, display: "flex" }}
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="#334155"
        paddingX={1}
      >
        <Text dimColor>{`    ${"Claude".padEnd(12)}${gpt ? "GPT" : ""}`}</Text>
        {rows.map((r) => (
          <Text key={`kit-meters-${r.label}`}>
            <Text dimColor>{`${r.label}  `}</Text>
            <Text>{cell(r.claude)}</Text>
            {gpt ? <Text color={GPT_COLOR}>{` ${cell(r.gpt)}`}</Text> : null}
          </Text>
        ))}
        {gpt ? <Text dimColor>{`balance: ${band}`}</Text> : null}
      </Box>
    </Box>
  );
}
