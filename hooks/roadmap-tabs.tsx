import type { Parts, Tab } from "./roadmap-parts";

// The roadmap pane's tabs (no tab element exists: a row of buttons, the shown one at full
// strength), and the Chat and Changes tabs. Pure, like roadmap-parts.tsx.

const TABS: [Tab, string][] = [
  ["roadmap", "▤ Roadmap"],
  ["chat", "◎ Chat"],
  ["changes", "± Changes"],
];

export function tabRow(p: Parts) {
  const { Box, Button } = p.el;
  return (
    <Box gap={1} flexWrap="wrap">
      {TABS.map(([t, label]) => (
        <Button
          key={`tab-${t}`}
          label={label}
          dimColor={p.tab !== t}
          onPress={() => p.act.tab(t)}
        />
      ))}
    </Box>
  );
}

// The context bar's colors, one per category in order; the rest of the window stays dim.
const SHADES = [
  "#818cf8",
  "#22c55e",
  "#f59e0b",
  "#38bdf8",
  "#f472b6",
  "#a3e635",
];
const BAR = 32;
const k = (tokens: number) => `${Math.round(tokens / 1000)}k`;

function duration(min: number): string {
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

// The Chat tab: the run, the context by category as a bar, what this chat touched.
export function chatTab(p: Parts) {
  const { Box, Text } = p.el;
  const c = p.chat;
  if (!c) return <Text dimColor>Reading this chat…</Text>;
  const shade = (i: number) => SHADES[i % SHADES.length];
  const cells = c.context.map((x) =>
    c.max ? Math.max(1, Math.round((x.tokens / c.max) * BAR)) : 0,
  );
  const rest = Math.max(0, BAR - cells.reduce((a, b) => a + b, 0));
  const facts = [
    `${c.turns} turn${c.turns === 1 ? "" : "s"}`,
    duration(c.minutes),
    c.usd === undefined ? null : `$${c.usd.toFixed(2)}`,
    c.compactions
      ? `${c.compactions} compaction${c.compactions === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between" gap={2} flexWrap="wrap">
        <Text>
          <Text bold>{c.model.replace(/^claude-/, "")}</Text>
          <Text
            dimColor
          >{` · ${c.effort ?? "auto"}${c.locked ? " ▪" : ""}`}</Text>
        </Text>
        <Text dimColor>{facts.join(" · ")}</Text>
      </Box>
      {c.max ? (
        <Box flexDirection="column">
          <Text>
            {cells.map((n, i) => (
              <Text key={`bar-${i}`} color={shade(i)}>
                {"█".repeat(n)}
              </Text>
            ))}
            <Text dimColor>{"░".repeat(rest)}</Text>
            <Text dimColor>{`  ${k(c.used)} / ${k(c.max)}`}</Text>
          </Text>
          {c.context.map((x, i) => (
            <Text key={`cat-${x.name}`}>
              <Text color={shade(i)}>{"■ "}</Text>
              <Text>{x.name.padEnd(22)}</Text>
              <Text dimColor>{k(x.tokens)}</Text>
            </Text>
          ))}
        </Box>
      ) : null}
      <Box flexDirection="column">
        <Text dimColor>{`Files this chat changed (${c.files.length})`}</Text>
        {c.files.length ? (
          c.files
            .slice(-15)
            .map((f) => (
              <Text key={`file-${f}`} wrap="truncate-start">{`  ${f}`}</Text>
            ))
        ) : (
          <Text dimColor> none yet</Text>
        )}
      </Box>
      {c.agents.length ? (
        <Text>
          <Text dimColor>Subagents </Text>
          {c.agents.map((a) => `${a.type} ×${a.n}`).join(" · ")}
        </Text>
      ) : null}
    </Box>
  );
}

// The Changes tab: git state, the changed files and the commits not live, with what acts on them.
export function changesTab(p: Parts) {
  const { Box, Text, Button } = p.el;
  const g = p.git;
  if (!g)
    return (
      <Text dimColor wrap="wrap">
        {p.gitError ? `git: ${p.gitError}` : "Not a git repository."}
      </Text>
    );
  const run = (key: string, label: string, command: string) => (
    <Button key={key} label={label} onPress={() => p.act.run(command)} />
  );
  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between" gap={2} flexWrap="wrap">
        <Text>
          <Text bold>{g.branch}</Text>
          <Text dimColor>
            {`  ${g.changed ? `${g.changed} changed` : "clean"}${g.unpushed ? ` · ${g.unpushed} not live` : ""}`}
          </Text>
        </Text>
        <Box gap={1} flexWrap="wrap">
          {g.changed && p.hasDiff ? run("changes-diff", "Diff", "diff") : null}
          {g.changed ? run("changes-commit", "✓ Commit", "kit:commit") : null}
          {g.unpushed ? run("changes-launch", "Launch", "kit:launch") : null}
        </Box>
      </Box>
      {g.files.length ? (
        <Box flexDirection="column">
          <Text dimColor>Changed</Text>
          {g.files.slice(0, 30).map((f) => (
            <Text
              key={`chg-${f}`}
              wrap="truncate-start"
            >{`  ${f.trim()}`}</Text>
          ))}
          {g.files.length > 30 ? (
            <Text dimColor>{`  +${g.files.length - 30} more`}</Text>
          ) : null}
        </Box>
      ) : null}
      {g.commits.length ? (
        <Box flexDirection="column">
          <Text dimColor>Not live</Text>
          {g.commits.map((line) => (
            <Text key={`cmt-${line}`} wrap="truncate-end">{`  ${line}`}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
