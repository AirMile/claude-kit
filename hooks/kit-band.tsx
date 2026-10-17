import type { CommandSpec, EngineInterface, On } from "claude-code";

import { getMode, runState, setMode } from "./auto-model";
import { GIT_ITEMS, gitAction } from "./git-menu";
import { isWarm, setWarm, warmCommandRun, warmInfo } from "./keep-warm";
import { limitInfo, resumeNow } from "./limit-guard";
import {
  displayName,
  EFFORTS,
  type Mode,
  PROFILES,
  profileName,
  runLine,
} from "./model-policy";
import { reset, setEffortLock } from "./model-switch";
import { isOrchestrating, setOrchestrating } from "./orchestrate";
import { openRoadmap } from "./roadmap-open";
import type { Usage } from "./roadmap-parts";
import { PANE } from "./roadmap-view";
import {
  type Ask,
  ASKS,
  askOpinion,
  CLAUDE,
  GPT,
  whoName,
} from "./second-opinion";

// The band above the prompt, one line that wraps when narrow, an open menu (a bordered block)
// above it: shown while the pointer rests on its button, kept open by a press. Left: context and plan usage (register.tsx measures it after each turn); the
// context figure is a button opening Compact and Clear, run just after the press. Right: the run
// (`Auto · model · effort` while a profile picks them, else the model; ⑂ and ♨ while orchestrate
// and keep cache are on) opening Auto (the profile from auto-model.ts, or Off) and the
// Orchestrate (orchestrate.ts) and Keep cache (keep-warm.ts) toggles; with Auto off, the effort
// (Default: the session's own); Git (⎇, git-menu.ts) with /commit first; a second opinion (⚖,
// second-opinion.ts: a row per Opinion, Review, Stuck, a press per model); the dashboard pane
// (▤). With Auto off the model is the app's own picker's. The plan-limit pause with Resume now
// (limit-guard.ts) follows on its own line. It yields to a survey. /band draws it again; /warm
// toggles keep warm.

export const bandCommand: CommandSpec = {
  name: "band",
  description:
    "Show kit's band above the prompt (usage, run, git, second opinion, dashboard)",
  immediate: true,
};

type Menu = "run" | "effort" | "ctx" | "git" | "opinion";

let menu: Menu | null = null; // the unfolded menu row
let usage: Usage[] = []; // context and plan limits, from register.tsx

// Context and plan limits, as register.tsx measures them after each turn.
export function bandUsage(figures: Usage[]): void {
  usage = figures;
}

// Compact and clear run just after the press: inside it they can be refused.
function soon($: EngineInterface, work: () => Promise<unknown>) {
  $.clock.after(50, async () => {
    await work();
    $.ui.invalidate("ui.render");
  });
}

function unfold($: EngineInterface, next: Menu | null) {
  menu = menu === next ? null : next;
  $.ui.invalidate("ui.render");
}

export function kitBand(on: On) {
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const { Box, Button, Text } = $.ui.resolve(e);
    const panes = await $.ui.panes().catch(() => []);
    const isOpen = panes.some((p) => p.id === PANE && p.isPlaced);
    const now = await getMode($);
    const run = await runState($);
    const pause = await limitInfo($);
    const warm = isWarm();
    const orch = await isOrchestrating($);
    const warmed = warmInfo();
    const ctx = usage.find((u) => u.label === "ctx");
    const meters = usage.filter((u) => u !== ctx);
    const done = () => unfold($, null);
    const close = (
      <Button key="kit-menu-close" label="×" dimColor onPress={done} />
    );

    // A line of the run menu: its name in a narrow column, its choices beside it.
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

    const bodyOf = (m: Menu) => {
      let body = null;
      if (m === "run") {
        const modes: Mode[] = [...PROFILES, "off"];
        body = (
          <Box flexDirection="column" flexGrow={1} gap={1}>
            {line(
              "Auto",
              modes.map((m) => (
                <Button
                  key={`kit-mode-${m}`}
                  label={profileName(m)}
                  dimColor={now !== m}
                  onPress={() => {
                    void setMode($, m).then(done);
                  }}
                />
              )),
            )}
            {line("Mode", [
              <Button
                key="kit-orchestrate"
                label="⑂ Orchestrate"
                dimColor={!orch}
                onPress={() => {
                  void setOrchestrating($, !orch).then(() =>
                    $.ui.invalidate("ui.render"),
                  );
                }}
              />,
              <Button
                key="kit-warm"
                label="♨ Keep cache"
                dimColor={!warm}
                onPress={() => {
                  void setWarm($, !warm);
                }}
              />,
            ])}
          </Box>
        );
      } else if (m === "effort") {
        const levels = ["default", ...EFFORTS] as const;
        body = (
          <Box flexDirection="column" flexGrow={1} gap={1}>
            {line(
              "Effort",
              levels.map((l) => (
                <Button
                  key={`kit-effort-${l}`}
                  label={l === "default" ? "Default" : l}
                  dimColor={(run.effort ?? "default") !== l}
                  onPress={() => {
                    void setEffortLock($, l === "default" ? undefined : l).then(
                      done,
                    );
                  }}
                />
              )),
            )}
          </Box>
        );
      } else if (m === "ctx") {
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
                      $.ui.toast(
                        `kit: could not start /commit: ${String(err)}`,
                      ),
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
      } else if (m === "opinion") {
        // One row per ask, GPT then Claude: a press sends at once.
        const sendTo = (a: Ask, who: string) => (
          <Button
            key={`kit-opinion-${a}-${who}`}
            label={whoName(who)}
            onPress={() => {
              done();
              void askOpinion($, who, a);
            }}
          />
        );
        body = (
          <Box flexDirection="column" flexGrow={1} gap={1}>
            {ASKS.map((a) =>
              line(a, [
                ...GPT.map((g) => sendTo(a, g)),
                <Text key={`kit-opinion-${a}-sep`} dimColor>
                  │
                </Text>,
                ...CLAUDE.map((c) => sendTo(a, c)),
              ]),
            )}
          </Box>
        );
      }

      return body;
    };

    // Each menu is drawn: the pressed one open, the others hidden until the pointer rests on
    // their button (or on the menu itself), which shares its hover scope. A press still opens
    // it for the keyboard.
    const MENUS: Menu[] = ["run", "effort", "ctx", "git", "opinion"];
    const menus = MENUS.map((m) => {
      const body = bodyOf(m);
      if (!body) return null;
      const open = menu === m;
      // The blank line below the block belongs to the hovered Box (padding, not margin), so the
      // pointer crossing it from the button keeps the menu shown.
      return (
        <Box
          key={`kit-menu-${m}`}
          flexDirection="column"
          paddingBottom={1}
          display={open ? "flex" : "none"}
          hover={open ? undefined : { scope: `kit-${m}`, display: "flex" }}
        >
          <Box gap={1} borderStyle="round" borderColor="#334155" paddingX={1}>
            {body}
            {open ? close : null}
          </Box>
        </Box>
      );
    });
    // A trigger button in a Box that joins its menu's hover scope.
    const trigger = (m: Menu, button: unknown) => (
      <Box
        key={`kit-trigger-${m}`}
        hover={{ scope: `kit-${m}`, backgroundColor: "#1e293b" }}
      >
        {button as never}
      </Box>
    );

    return (
      <Box flexDirection="column">
        {menus}
        <Box justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box key="kit-usage" gap={2} flexWrap="wrap">
            {trigger(
              "ctx",
              <Button
                key="kit-ctx"
                label={ctx ? `ctx ${ctx.value}` : "ctx"}
                onPress={() => unfold($, "ctx")}
              />,
            )}
            {meters.map((u) => (
              <Text key={`kit-usage-${u.label}`}>
                <Text dimColor>{`${u.label} `}</Text>
                <Text bold>{u.value}</Text>
                {u.note ? <Text dimColor>{` · ${u.note}`}</Text> : null}
              </Text>
            ))}
          </Box>
          <Box key="kit-actions" gap={1} flexWrap="wrap">
            {trigger(
              "run",
              <Button
                key="kit-run"
                label={`${run.auto ? `Auto · ${runLine(run.model, run.effort)}` : displayName(run.model)}${
                  orch || warm ? ` ${orch ? "⑂" : ""}${warm ? "♨" : ""}` : ""
                }`}
                onPress={() => unfold($, "run")}
              />,
            )}
            {run.auto
              ? null
              : trigger(
                  "effort",
                  <Button
                    key="kit-effort"
                    label={run.effort ?? "effort"}
                    dimColor={!run.effort}
                    onPress={() => unfold($, "effort")}
                  />,
                )}
            {trigger(
              "git",
              <Button
                key="kit-git"
                label="⎇ Git"
                onPress={() => unfold($, "git")}
              />,
            )}
            {trigger(
              "opinion",
              <Button
                key="kit-opinion"
                label="⚖ Ask"
                onPress={() => unfold($, "opinion")}
              />,
            )}
            <Button
              key="kit-roadmap"
              label={isOpen ? "▤ Close" : "▤"}
              onPress={() => {
                const toggle = isOpen
                  ? $.ui.close({ id: PANE })
                  : openRoadmap($);
                void toggle.then(() => $.ui.invalidate("ui.render"));
              }}
            />
          </Box>
        </Box>
        {warmed || pause ? (
          <Box gap={1} flexWrap="wrap">
            {warmed ? <Text dimColor>{warmed}</Text> : null}
            {pause ? <Text color="#f59e0b">{pause}</Text> : null}
            {pause ? (
              <Button
                key="kit-resume"
                label="Resume now"
                onPress={() => {
                  void resumeNow($);
                }}
              />
            ) : null}
          </Box>
        ) : null}
      </Box>
    );
  });

  on("command.run", { command: "warm" }, async ($, e) => ({
    text: await warmCommandRun($, e.args),
  }));

  // There is no call that unfolds a band the person folded; a redraw is what a plugin has.
  on("command.run", { command: "band" }, async ($) => {
    $.ui.invalidate("ui.render");
    return {
      text: "kit band drawn above the prompt. Folded ([+])? ctrl+x ctrl+a unfolds it.",
    };
  });
}
