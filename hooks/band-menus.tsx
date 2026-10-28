import type { EngineInterface } from "claude-code";

import { GIT_ITEMS, gitAction } from "./git-menu";
import { reset } from "./model-switch";

// The band's menus (kit-band.tsx draws and opens them): the context (Compact, Clear), Git and
// the skills (kit's skills by stage, with the dashboard pane's Open or Close), each a row of
// choices beside its name.

export type Menu = "ctx" | "git" | "skills";

export type MenuState = {
  ui: ReturnType<EngineInterface["ui"]["resolve"]>;
  done: () => void;
  isOpen: boolean; // the dashboard pane is open
  isSetUp: boolean; // the project has an AGENTS.md; Setup leads while it doesn't
  toggleDashboard: () => void;
};

// kit's skills by stage of work: [key, label, command, args].
const STAGES: [string, [string, string, string, string?][]][] = [
  [
    "Plan",
    [
      ["brainstorm", "Brainstorm", "kit:product", "brainstorm"],
      ["critique", "Critique", "kit:product", "critique"],
      ["theme", "Theme", "kit:theme"],
    ],
  ],
  [
    "Make",
    [
      ["convert", "Convert", "kit:convert"],
      ["explain", "Explain", "kit:explain"],
      ["lessons", "Lessons", "kit:lessons"],
    ],
  ],
  [
    "Client",
    [
      ["intake", "Intake", "kit:intake"],
      ["seo", "SEO", "kit:seo"],
      ["audit", "Audit", "kit:audit"],
      ["scan", "Scan", "kit:scan"],
    ],
  ],
];

// Compact and clear run just after the press: inside it they can be refused.
function soon($: EngineInterface, work: () => Promise<unknown>) {
  $.clock.after(50, async () => {
    await work();
    $.ui.invalidate("ui.render");
  });
}

export function menuBody($: EngineInterface, m: Menu, s: MenuState) {
  const { Box, Button, Text } = s.ui;
  const { done } = s;
  // A line of a menu: its name in a narrow column, its choices beside it.
  const line = (name: string, items: unknown[]) => (
    <Box key={`kit-line-${name}`} gap={1}>
      <Box width={8} flexShrink={0}>
        <Text dimColor>{name}</Text>
      </Box>
      <Box gap={1} flexWrap="wrap">
        {items as never}
      </Box>
    </Box>
  );

  let body = null;
  if (m === "ctx") {
    body = (
      <Box flexDirection="column" flexGrow={1} gap={1}>
        {line("Context", [
          <Button
            key="kit-compact"
            label="⇲ Compact"
            onPress={() => {
              done();
              soon($, () => reset($, "compact"));
            }}
          />,
          <Button
            key="kit-clear"
            label="⌫ Clear"
            onPress={() => {
              done();
              soon($, () => reset($, "clear"));
            }}
          />,
        ])}
      </Box>
    );
  } else if (m === "git") {
    body = (
      <Box flexDirection="column" flexGrow={1} gap={1}>
        {line("Git", [
          <Button
            key="kit-git-Commit"
            label="✓ Commit"
            onPress={() => {
              done();
              void $.command
                .run({ command: "kit:commit" })
                .catch((err) =>
                  $.ui.toast(`kit: could not start /commit: ${String(err)}`),
                );
            }}
          />,
          ...GIT_ITEMS.map((g) => (
            <Button
              key={`kit-git-${g}`}
              label={g}
              onPress={() => {
                done();
                void gitAction($, g);
              }}
            />
          )),
        ])}
      </Box>
    );
  }

  else if (m === "skills") {
    // A skill runs just after the press, like Compact; failing, its line goes in the prompt.
    const skill = (key: string, label: string, command: string, args = "") => (
      <Button
        key={`kit-skill-${key}`}
        label={label}
        variant={key === "setup" ? "primary" : "secondary"}
        onPress={() => {
          done();
          soon($, async () => {
            try {
              await $.command.run(args ? { command, args } : { command });
            } catch (err) {
              await $.prompt.fill({ text: `/${command}${args ? ` ${args}` : ""}` });
              $.ui.toast(`kit: run /${command} yourself (${String(err)})`);
            }
          });
        }}
      />
    );
    body = (
      <Box flexDirection="column" flexGrow={1}>
        {line("Panel", [
          <Button
            key="kit-dashboard"
            variant="primary"
            label={s.isOpen ? "▤ Close dashboard" : "▤ Open dashboard"}
            onPress={() => {
              done();
              s.toggleDashboard();
            }}
          />,
        ])}
        {STAGES.map(([name, skills]) =>
          line(name, [
            ...(name === "Plan" && !s.isSetUp
              ? [skill("setup", "Setup", "kit:setup")]
              : []),
            ...skills.map(([k, l, c, a]) => skill(k, l, c, a)),
          ]),
        )}
      </Box>
    );
  }

  return body;
}
