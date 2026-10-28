import type { CommandSpec, EngineInterface, On } from "claude-code";

import { getMode, runState, setMode } from "./auto-model";
import { type Menu, menuBody } from "./band-menus";
import { gptOn, setGptOn } from "./codex-run";
import { warmInfo } from "./keep-warm";
import {
  getHold,
  limitInfo,
  resumeNow,
  setHold,
  warmCommandRun,
} from "./limit-guard";
import { type Hold, nextHold } from "./limit-policy";
import {
  type Effort,
  EFFORTS,
  type Mode,
  PROFILES,
  profileName,
  runLine,
} from "./model-policy";
import { setEffortLock } from "./model-switch";
import { openRoadmap } from "./roadmap-open";
import { inRoot } from "./spec";
import type { Usage } from "./roadmap-parts";
import { PANE } from "./roadmap-view";

// The band above the prompt, one line that never wraps, an open menu (a bordered
// block) above it: shown while the pointer rests on its button, kept open by a press. Left:
// context and plan usage with the time until each resets (register.tsx measures it after each
// turn); the context figure is a button opening Compact and Clear, run just after the press.
// Right: the model with the profile's effort, or with the profile off the effort between ‹
// and ›, a step down or up (below low: the session's own); then switches a press cycles: the
// profile (A·L, A·B, A·Q for Lean, Balanced, Quality from auto-model.ts, A dim for off), GPT (on or off, codex-run.ts; a ChatGPT window from half used), the
// limit hold (limit-guard.ts): off, Limit (pause at the plan limit, the cache warm while work
// is open) or Warm (also warm while idle, keep-warm.ts), with the pings so far. Then Git (⎇,
// git-menu.ts) with /commit first and the skills menu (▤: kit's skills by stage on hover; a press opens or closes the
// dashboard pane). The plan-limit pause with Resume
// now (limit-guard.ts) follows on its own line. It yields to a survey. /band draws it again;
// /warm toggles the hold's keep warm.

export const bandCommand: CommandSpec = {
  name: "band",
  description: "Show kit's band above the prompt (usage, run, git, skills, dashboard)",
  immediate: true,
};

// A GPT window on the GPT switch is noise until half of it is used.
const NOTE_FROM = 50;
const MODES: readonly Mode[] = [...PROFILES, "off"];
// The effort steps ‹ and › walk with the profile off: the session's own, then low to max.
const LEVELS: readonly (Effort | undefined)[] = [undefined, ...EFFORTS];

const HOLD_LABEL: Record<Hold, string> = {
  off: "⏸ Off",
  pause: "⏸ Limit",
  warm: "⏸♨ Warm",
};

let menu: Menu | null = null; // the unfolded menu row
let usage: Usage[] = []; // context and plan limits, from register.tsx

// Context and plan limits, as register.tsx measures them after each turn.
export function bandUsage(figures: Usage[]): void {
  usage = figures;
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
    const hold = await getHold($);
    const gpt = await gptOn($);
    const ctx = usage.find((u) => u.label === "ctx");
    const meters = usage.filter((u) => u !== ctx && !u.label.startsWith("gpt"));
    const gptTight = usage
      .filter((u) => u.label.startsWith("gpt") && u.pct >= NOTE_FROM)
      .map((u) => ` ${u.label.slice(4)} ${u.value}`)
      .join("");
    const done = () => unfold($, null);
    // With the profile off, ‹ and › move the hand-set effort one level.
    const at = LEVELS.indexOf(run.effort as Effort | undefined);
    const step = (by: number) => {
      const to = at + by;
      if (to < 0 || to >= LEVELS.length) return;
      void setEffortLock($, LEVELS[to]).then(() => $.ui.invalidate("ui.render"));
    };
    const close = (
      <Button key="kit-menu-close" label="×" dimColor onPress={done} />
    );

    const root = await $.session.root();
    const isSetUp = await $.fs.exists(inRoot(root, "AGENTS.md")).catch(() => true);
    const toggleDashboard = () => {
      const toggle = isOpen ? $.ui.close({ id: PANE }) : openRoadmap($);
      void toggle.then(() => $.ui.invalidate("ui.render"));
    };
    const state = {
      ui: $.ui.resolve(e),
      done,
      isOpen,
      isSetUp,
      toggleDashboard,
    };

    // Each menu is drawn: the pressed one open, the others hidden until the pointer rests on
    // their button (or on the menu itself), which shares its hover scope. A press still opens
    // it for the keyboard.
    const MENUS: Menu[] = ["ctx", "git", "skills"];
    const menus = MENUS.map((m) => {
      const body = menuBody($, m, state);
      if (!body) return null;
      const open = menu === m;
      // The blank line below the block belongs to the hovered Box (padding, not margin), so the
      // pointer crossing it from the button keeps the menu shown. Each block sits above its
      // button's side: the context menu left, Git and the skills right.
      return (
        <Box
          key={`kit-menu-${m}`}
          flexDirection="column"
          alignItems={m === "ctx" ? "flex-start" : "flex-end"}
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
        <Box justifyContent="space-between" gap={2}>
          <Box key="kit-usage" gap={2} flexShrink={1}>
            {trigger(
              "ctx",
              <Button
                key="kit-ctx"
                label={ctx ? ctx.value : "–"}
                onPress={() => unfold($, "ctx")}
              />,
            )}
            {meters.map((u) => (
              <Text key={`kit-usage-${u.label}`} wrap="truncate-end">
                <Text dimColor>{`${u.label} `}</Text>
                <Text bold>{u.value}</Text>
                {u.note ? <Text dimColor>{`·${u.note}`}</Text> : null}
              </Text>
            ))}
          </Box>
          <Box key="kit-actions" gap={1} flexShrink={0}>
            <Text key="kit-run" dimColor>
              {runLine(run.model, run.auto ? run.effort : undefined)}
            </Text>
            {run.auto ? null : (
              <Box key="kit-effort" gap={0}>
                <Button
                  key="kit-effort-down"
                  label="‹"
                  plain
                  dimColor={at <= 0}
                  onPress={() => step(-1)}
                />
                <Text key="kit-effort-level">{` ${run.effort ?? "default"} `}</Text>
                <Button
                  key="kit-effort-up"
                  label="›"
                  plain
                  dimColor={at >= LEVELS.length - 1}
                  onPress={() => step(1)}
                />
              </Box>
            )}
            <Button
              key="kit-profile"
              label={run.auto ? `A·${profileName(now).charAt(0)}` : "A"}
              dimColor={!run.auto}
              onPress={() => {
                const after = MODES[(MODES.indexOf(now) + 1) % MODES.length]!;
                void setMode($, after).then(() => $.ui.invalidate("ui.render"));
              }}
            />
            <Button
              key="kit-gpt"
              label={gpt ? `GPT${gptTight}` : "GPT off"}
              dimColor={!gpt}
              onPress={() => {
                void setGptOn($, !gpt).then(() => $.ui.invalidate("ui.render"));
              }}
            />
            <Button
              key="kit-hold"
              label={`${HOLD_LABEL[hold]}${warmInfo()}`}
              dimColor={hold === "off"}
              onPress={() => {
                void setHold($, nextHold(hold));
              }}
            />
            {trigger(
              "git",
              <Button
                key="kit-git"
                label="⎇"
                onPress={() => unfold($, "git")}
              />,
            )}
            {trigger(
              "skills",
              <Button
                key="kit-roadmap"
                label={isOpen ? "▤ Close" : "▤"}
                onPress={toggleDashboard}
              />,
            )}
          </Box>
        </Box>
        {pause ? (
          <Box gap={1} flexWrap="wrap">
            <Text color="#f59e0b">{pause}</Text>
            <Button
              key="kit-resume"
              label="Resume now"
              onPress={() => {
                void resumeNow($);
              }}
            />
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
