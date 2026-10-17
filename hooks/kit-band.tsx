import type { CommandSpec, EngineInterface, On } from "claude-code";

import { getMode, runState, setMode, switchModel } from "./auto-model";
import { GIT_ITEMS, gitAction } from "./git-menu";
import { isWarm, setWarm, warmCommandRun, warmInfo } from "./keep-warm";
import { limitInfo, resumeNow } from "./limit-guard";
import {
  displayName,
  EFFORTS,
  family,
  MODELS,
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
// above it. Left: context and plan usage (register.tsx measures it after each turn); the
// context figure is a button opening Compact and Clear, run just after the press. Right: the run
// (model · effort, ▪ when the effort is locked, ⑂ and ♨ while orchestrate and keep cache are
// on) opening Model (then keep the context, compact or clear), Profile (auto-model.ts), Effort
// (a pick locks it, Auto unlocks) and the Orchestrate (orchestrate.ts) and Keep cache
// (keep-warm.ts) toggles; Git (⎇, git-menu.ts) with /commit first; a second opinion (⚖,
// second-opinion.ts: a row per Opinion, Review, Stuck, a press per model); the dashboard pane
// (▤). The plan-limit pause with Resume now (limit-guard.ts) follows on its own line.
// It yields to a survey. /band draws it again; /warm toggles keep warm.

export const bandCommand: CommandSpec = {
  name: "band",
  description:
    "Show kit's band above the prompt (usage, run, git, second opinion, dashboard)",
  immediate: true,
};

type Menu = "run" | "ctx" | "git" | "way" | "opinion";

let menu: Menu | null = null; // the unfolded menu row
let usage: Usage[] = []; // context and plan limits, from register.tsx

// Context and plan limits, as register.tsx measures them after each turn.
export function bandUsage(figures: Usage[]): void {
  usage = figures;
}

let target = ""; // the model picked in the model row, for the way row

// Compact, clear and a switch run just after the press: inside it they can be refused.
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

    let body = null;
    if (menu === "run") {
      const modes: Mode[] = [...PROFILES, "off"];
      const levels = ["auto", ...EFFORTS] as const;
      body = (
        <Box flexDirection="column" flexGrow={1}>
          {line(
            "Model",
            MODELS.map((m) => (
              <Button
                key={`kit-model-${m}`}
                label={displayName(m)}
                dimColor={family(m) !== family(run.model)}
                onPress={() => {
                  if (family(m) === family(run.model)) return done();
                  target = m;
                  unfold($, "way");
                }}
              />
            )),
          )}
          {line(
            "Profile",
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
          {line(
            "Effort",
            levels.map((l) => (
              <Button
                key={`kit-effort-${l}`}
                label={l === "auto" ? "Auto" : l}
                dimColor={run.locked ? run.effort !== l : l !== "auto"}
                onPress={() => {
                  void setEffortLock($, l === "auto" ? undefined : l).then(
                    done,
                  );
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
    } else if (menu === "ctx") {
      body = (
        <Box flexDirection="column" flexGrow={1}>
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
    } else if (menu === "git") {
      body = (
        <Box flexDirection="column" flexGrow={1}>
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
    } else if (menu === "opinion") {
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
        <Box flexDirection="column" flexGrow={1}>
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
    } else if (menu === "way") {
      const ways = [
        ["keep", "Keep context"],
        ["compact", "Compact"],
        ["clear", "Clear"],
      ] as const;
      body = (
        <Box gap={1} flexWrap="wrap" flexGrow={1}>
          <Text dimColor>{`→ ${displayName(target)}:`}</Text>
          {ways.map(([way, label]) => (
            <Button
              key={`kit-way-${way}`}
              label={label}
              onPress={() => {
                done();
                soon($, () => switchModel($, target, way));
              }}
            />
          ))}
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        {body ? (
          <Box
            key="kit-menu"
            gap={1}
            borderStyle="round"
            borderColor="#334155"
            paddingX={1}
            marginBottom={1}
          >
            {body}
            {close}
          </Box>
        ) : null}
        <Box justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box key="kit-usage" gap={2} flexWrap="wrap">
            <Button
              key="kit-ctx"
              label={ctx ? `ctx ${ctx.value}` : "ctx"}
              onPress={() => unfold($, "ctx")}
            />
            {meters.map((u) => (
              <Text key={`kit-usage-${u.label}`}>
                <Text dimColor>{`${u.label} `}</Text>
                <Text bold>{u.value}</Text>
                {u.note ? <Text dimColor>{` ↻${u.note}`}</Text> : null}
              </Text>
            ))}
          </Box>
          <Box key="kit-actions" gap={1} flexWrap="wrap">
            <Button
              key="kit-run"
              label={`${runLine(run.model, run.effort)}${run.locked ? " ▪" : ""}${
                orch || warm ? ` ${orch ? "⑂" : ""}${warm ? "♨" : ""}` : ""
              }`}
              onPress={() => unfold($, "run")}
            />
            <Button
              key="kit-git"
              label="⎇ Git"
              onPress={() => unfold($, "git")}
            />
            <Button
              key="kit-opinion"
              label="⚖ Opinion"
              onPress={() => unfold($, "opinion")}
            />
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
