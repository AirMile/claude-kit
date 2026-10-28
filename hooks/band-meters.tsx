import type { EngineInterface } from "claude-code";

import type { Usage } from "./roadmap-parts";

// The band's plan meters: per window Claude's share, ChatGPT's dim beside it and Claude's time
// until reset (`5h 30%·2% 3h29m`). With GPT off: Claude's share only. The 5h windows reset
// together (window-sync.ts), so Claude's reset stands for both.

type Ui = ReturnType<EngineInterface["ui"]["resolve"]>;
export type MeterRow = { label: string; claude?: Usage; gpt?: Usage };

const WINDOWS = ["5h", "wk"] as const;

// The two windows, each with whichever plan reported it; with GPT off, Claude's alone.
export function meterRows(usage: readonly Usage[], gptOn = true): MeterRow[] {
  return WINDOWS.map((label) => ({
    label,
    claude: usage.find((u) => u.label === label),
    gpt: gptOn ? usage.find((u) => u.label === `gpt ${label}`) : undefined,
  })).filter((r) => r.claude || r.gpt);
}

// The band's line: `5h 30%·2% 3h29m`, GPT's share dim beside Claude's, then Claude's reset.
export function meterLine(ui: Ui, rows: readonly MeterRow[]) {
  const { Text } = ui;
  return rows.map((r) => (
    <Text key={`kit-usage-${r.label}`} wrap="truncate-end">
      <Text dimColor>{`${r.label} `}</Text>
      <Text bold>{r.claude?.value ?? "–"}</Text>
      {r.gpt ? <Text dimColor>{`·${r.gpt.value}`}</Text> : null}
      {r.claude?.note ? <Text dimColor>{` ${r.claude.note}`}</Text> : null}
    </Text>
  ));
}
