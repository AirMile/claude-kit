import type { CommandSpec, EngineInterface, On } from "claude-code";

import { getMode, runState, setMode, switchModel } from "./auto-model";
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
} from "./model-policy";
import { reset, setEffortLock } from "./model-switch";
import { openRoadmap } from "./roadmap-open";
import { PANE } from "./roadmap-view";

// The band above the prompt, one row of icon buttons: the profile (◇, auto-model.ts), the model
// main requests go to (◆) and their effort (◐, ▪ when locked), compact (⇲), clear (⌫), /commit (✓),
// keep warm (♨, keep-warm.ts), the plan-limit pause with Resume now (limit-guard.ts), and the
// roadmap pane at the right end (▤); each icon carries a short word, an icon alone is too small to hit. A press on ◇ ◆ ◐ ⇲ ⌫ unfolds a second
// row: the profiles, the models (then keep the context, compact or clear), the effort levels
// (a pick locks it, Auto unlocks), or a confirm for compact and clear, which can't be undone.
// It yields to a survey. /band draws it again; /warm toggles keep warm.

export const bandCommand: CommandSpec = {
  name: "band",
  description:
    "Show kit's band above the prompt (profile, model, effort, compact, clear, roadmap)",
  immediate: true,
};

type Menu = "profile" | "model" | "way" | "effort" | "compact" | "clear";

let menu: Menu | null = null; // the unfolded second row
let target = ""; // the model picked in the model row, for the way row

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
    const warmed = warmInfo();
    const done = () => unfold($, null);
    const close = (
      <Button key="kit-menu-close" label="×" dimColor onPress={done} />
    );

    let row = null;
    if (menu === "profile") {
      const modes: Mode[] = [...PROFILES, "off"];
      row = modes.map((m) => (
        <Button
          key={`kit-mode-${m}`}
          label={profileName(m)}
          dimColor={now !== m}
          onPress={() => {
            void setMode($, m).then(done);
          }}
        />
      ));
    } else if (menu === "model") {
      row = MODELS.map((m) => (
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
      ));
    } else if (menu === "way") {
      const ways = [
        ["keep", "Keep context"],
        ["compact", "Compact"],
        ["clear", "Clear"],
      ] as const;
      row = [
        <Text key="kit-way-to" dimColor>{`→ ${displayName(target)}:`}</Text>,
        ...ways.map(([way, label]) => (
          <Button
            key={`kit-way-${way}`}
            label={label}
            onPress={() => {
              done();
              void switchModel($, target, way);
            }}
          />
        )),
      ];
    } else if (menu === "effort") {
      const levels = ["auto", ...EFFORTS] as const;
      row = [
        <Text
          key="kit-effort-for"
          dimColor
        >{`${displayName(run.model)}:`}</Text>,
        ...levels.map((l) => (
          <Button
            key={`kit-effort-${l}`}
            label={l === "auto" ? "Auto" : l}
            dimColor={run.locked ? run.effort !== l : l !== "auto"}
            onPress={() => {
              void setEffortLock($, l === "auto" ? undefined : l).then(done);
            }}
          />
        )),
      ];
    } else if (menu === "compact" || menu === "clear") {
      const way = menu;
      row = [
        <Text key="kit-confirm" dimColor>
          {way === "clear" ? "Clear this chat?" : "Compact this chat?"}
        </Text>,
        <Button
          key="kit-confirm-yes"
          label={way === "clear" ? "Clear" : "Compact"}
          onPress={() => {
            done();
            void reset($, way).then(() => $.ui.invalidate("ui.render"));
          }}
        />,
      ];
    }

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box gap={1} flexWrap="wrap">
            <Button
              key="kit-profile"
              label={`◇ ${profileName(now)}`}
              onPress={() => unfold($, "profile")}
            />
            <Button
              key="kit-model"
              label={`◆ ${displayName(run.model)}`}
              onPress={() => unfold($, "model")}
            />
            <Button
              key="kit-effort"
              label={`◐ ${run.effort ?? "auto"}${run.locked ? " ▪" : ""}`}
              onPress={() => unfold($, "effort")}
            />
            <Button
              key="kit-compact"
              label="⇲ Compact"
              onPress={() => unfold($, "compact")}
            />
            <Button
              key="kit-clear"
              label="⌫ Clear"
              onPress={() => unfold($, "clear")}
            />
            <Button
              key="kit-commit"
              label="✓ Commit"
              onPress={() => {
                void $.command
                  .run({ command: "kit:commit" })
                  .catch((err) =>
                    $.ui.toast(`kit: could not start /commit: ${String(err)}`),
                  );
              }}
            />
            <Button
              key="kit-warm"
              label="♨ Warm"
              dimColor={!warm}
              onPress={() => {
                void setWarm($, !warm);
              }}
            />
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
          <Button
            key="kit-roadmap"
            label={isOpen ? "▤ Close roadmap" : "▤ Roadmap"}
            onPress={() => {
              const toggle = isOpen ? $.ui.close({ id: PANE }) : openRoadmap($);
              void toggle.then(() => $.ui.invalidate("ui.render"));
            }}
          />
        </Box>
        {row ? (
          <Box gap={1} flexWrap="wrap">
            {row}
            {close}
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
