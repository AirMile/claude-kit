import { type Parts, phaseNames } from "./roadmap-parts";
import { phases } from "./roadmap-phase";
import { later } from "./roadmap-later";

// The roadmap pane's top (the pane's title is the product): a dashboard of context and plan usage and kit's
// skills as buttons. Pure, like roadmap-parts.tsx.

export function body(p: Parts) {
  const { Box, Text } = p.el;
  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
      {p.draft ? null : dashboard(p)}
      {p.note ? <Text color="#818cf8">{p.note}</Text> : null}
      {phases(p, phaseNames(p))}
      {p.later.length || !p.draft ? later(p) : null}
    </Box>
  );
}

// Calm below the fresh-start advice (60%), amber up to 85%, red above.
const tone = (pct: number) =>
  pct < 60 ? undefined : pct < 85 ? "#f59e0b" : "#ef4444";

// The dashboard: its own bordered block above the roadmap. Usage; git state with Diff, Commit
// and Launch only when there is something for them to do; then kit's skills as buttons.
function dashboard(p: Parts) {
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
  return (
    <Box
      flexDirection="column"
      gap={1}
      borderStyle="round"
      borderColor="#334155"
      paddingX={2}
      paddingY={1}
    >
      {/* Usage, with the two commands that act on the context: compact or clear it. */}
      <Box justifyContent="space-between" gap={2}>
        <Text wrap="wrap">
          {p.usage.map((u, i) => (
            <Text key={u.label}>
              {i ? "     " : ""}
              <Text dimColor>{`${u.label} `}</Text>
              <Text bold color={tone(u.pct)}>
                {u.value}
              </Text>
              {u.note ? <Text dimColor>{` · ${u.note}`}</Text> : null}
            </Text>
          ))}
        </Text>
        <Box gap={1}>
          {skill("compact", "Compact", "compact")}
          {skill("clear", "Clear", "clear")}
        </Box>
      </Box>
      {!g && p.gitError ? (
        <Text dimColor wrap="wrap">{`git: ${p.gitError}`}</Text>
      ) : null}
      {g ? (
        <Box justifyContent="space-between" gap={2}>
          <Text wrap="wrap">
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
          <Box gap={1}>
            {g.changed && p.hasDiff ? skill("diff", "Diff", "diff") : null}
            {g.changed ? skill("commit", "Commit", "kit:commit") : null}
            {g.unpushed ? skill("launch", "Launch", "kit:launch") : null}
          </Box>
        </Box>
      ) : null}
      <Box gap={1} marginTop={1}>
        {p.isSetUp ? null : skill("setup", "Setup", "kit:setup", "", true)}
        {skill("ideas", "Ideas", "kit:roadmap", "brainstorm")}
        {skill("critique", "Critique", "kit:roadmap", "critique")}
        {skill("theme", "Theme", "kit:theme")}
        {skill("audit", "Audit", "kit:audit")}
      </Box>
    </Box>
  );
}
