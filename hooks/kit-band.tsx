import type { CommandSpec, EngineInterface, On } from "claude-code";

import { getMode, runState } from "./auto-model";
import {
  contextMenu,
  type Menu,
  PROFILE_MARK,
  profileMenu,
} from "./band-menus";
import { geminiCached, readGemini } from "./agy-usage";
import {
  meterLine,
  meterRings,
  meterRows,
  NO_FIGURES,
  planMeters,
  shownRows,
  type Switched,
  type Usage,
  usageTable,
} from "./band-meters";
import { gptCached, gptOn, gptStatus, setGptOn } from "./codex-run";
import { geminiOn, setGeminiOn } from "./gemini-switch";
import { warmInfo } from "./keep-warm";
import {
  getHold,
  limitInfo,
  resumeNow,
  setHold,
  warmCommandRun,
} from "./limit-guard";
import { limitCommandRun } from "./limit-command";
import { type Hold, nextHold } from "./limit-policy";
import { type Effort, displayName, effortLabel } from "./model-policy";

// The band above the prompt, one line that never wraps, an open menu (a bordered
// block) above it: shown while the pointer rests on its button, kept open by a press. Left:
// plan usage (band-meters.tsx: text on a terminal, elsewhere a 5h and a week ring of all three
// plans, whose table holds the GPT and Gemini switches; register.tsx measures after each turn).
// Right, in this order: the effort main requests run at, the model and the profile's mark
// (◔ ◑ ● for Lean, Balanced, Quality from auto-model.ts, ○ dim for off), together opening the
// profile menu with the profiles and efforts; the limit hold (limit-guard.ts), a switch a press
// cycles: off, Limit (pause at the plan limit, the cache warm while work is open) or Warm (also
// warm while idle, keep-warm.ts), with the pings so far; and rightmost the context figure,
// opening Compact and Clear, run just after the press. The plan-limit pause with Resume now
// (limit-guard.ts) follows on its own line. It yields to a survey. /band draws it again; /warm
// toggles the hold's keep warm.

export const bandCommand: CommandSpec = {
  name: "band",
  description: "Show kit's band above the prompt (usage, model, switches)",
  immediate: true,
};

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

// Flips a plan's switch and, turned on, reads its meters (drawn as they arrive).
async function switchPlan($: EngineInterface, plan: Switched, next: boolean) {
  const redraw = () => $.ui.invalidate("ui.render");
  if (plan === "gpt") await setGptOn($, next);
  else if (!(await setGeminiOn($, next))) {
    $.ui.toast("kit: could not save the Gemini switch");
    return;
  }
  redraw();
  if (!next) return;
  await (plan === "gpt" ? gptStatus($) : readGemini($));
  redraw();
}

export function kitBand(on: On) {
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const ui = $.ui.resolve(e);
    const { Box, Button, Text } = ui;
    const now = await getMode($);
    const run = await runState($);
    const pause = await limitInfo($);
    const hold = await getHold($);
    const switches = { gpt: await gptOn($), gemini: await geminiOn($) };
    const ctx = usage.find((u) => u.label === "ctx");
    // The other plans' figures come from their last read, so a switch shows them at once.
    const time = await $.clock.now();
    const codex = gptCached();
    const read = meterRows([
      ...usage,
      ...planMeters("gpt", codex?.error ? undefined : codex?.limits, time),
      ...planMeters("gem", geminiCached(), time),
    ]);
    const rows = read.length || e.surface === "terminal" ? read : NO_FIGURES;
    // The rings and the line leave a plan that is off out; its table keeps the figures.
    const drawn = shownRows(rows, switches);
    const ringRows = drawn.length ? drawn : NO_FIGURES;
    const flip = (plan: Switched) => {
      void switchPlan($, plan, !switches[plan]);
    };
    const done = () => unfold($, null);
    // The effort as a cell that fills: its block on a dim ground, so low reads as a level.
    const cell = (effort: string) => (
      <Text backgroundColor="#334155" dimColor={false}>
        {effortLabel(effort)}
      </Text>
    );
    const close = (
      <Button key="kit-menu-close" label="×" dimColor onPress={done} />
    );

    // Each menu is drawn: the pressed one open, the others hidden until the pointer rests on
    // their button (or on the menu itself), which shares its hover scope. A press still opens
    // it for the keyboard.
    const MENUS: Menu[] = ["usage", "profile", "ctx"];
    const bodyOf = (m: Menu) => {
      // "usage" is the rings' figures: only where rings are drawn.
      if (m === "usage")
        return (
          e.surface !== "terminal" && usageTable(ui, rows, switches, flip)
        );
      const state = { ui: $.ui.resolve(e), done };
      if (m === "ctx") return contextMenu($, state);
      const effort = run.effort as Effort | undefined;
      return profileMenu($, { ...state, mode: now, effort });
    };
    const menus = MENUS.map((m) => {
      const body = bodyOf(m);
      if (!body) return null;
      const open = menu === m;
      // The blank line below the block belongs to the hovered Box (padding, not margin), so the
      // pointer crossing it from the button keeps the menu shown. Each block sits above its
      // button: the usage menu at the left, the profile and context menus at the right.
      return (
        <Box
          key={`kit-menu-${m}`}
          flexDirection="column"
          alignItems={m === "usage" ? "flex-start" : "flex-end"}
          paddingBottom={1}
          display={open ? "flex" : "none"}
          hover={open ? undefined : { scope: `kit-${m}`, display: "flex" }}
        >
          <Box
            gap={1}
            alignItems="flex-start"
            borderStyle="round"
            borderColor="#334155"
            paddingX={1}
          >
            {body}
            {open ? close : null}
          </Box>
        </Box>
      );
    });
    const meters = (
      <Box key="kit-meters" gap={2}>
        {e.surface === "terminal"
          ? meterLine(ui, drawn)
          : meterRings($.ui.resolve(e), ringRows)}
      </Box>
    );
    // A trigger (a button, for the profile with the model beside it) in a Box that joins its
    // menu's hover scope.
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
            {e.surface === "terminal" ? meters : trigger("usage", meters)}
          </Box>
          <Box key="kit-actions" gap={1} flexShrink={0}>
            {trigger(
              "profile",
              <Box gap={1} alignItems="center">
                <Text key="kit-run" dimColor>
                  {run.effort ? cell(run.effort) : null}
                  {run.effort ? " " : ""}
                  {displayName(run.model)}
                </Text>
                <Button
                  key="kit-profile"
                  label={PROFILE_MARK[now]}
                  dimColor={!run.auto}
                  onPress={() => unfold($, "profile")}
                />
              </Box>,
            )}
            <Button
              key="kit-hold"
              label={`${HOLD_LABEL[hold]}${warmInfo()}`}
              dimColor={hold === "off"}
              onPress={() => {
                void setHold($, nextHold(hold));
              }}
            />
            {trigger(
              "ctx",
              <Button
                key="kit-ctx"
                label={ctx ? ctx.value : "–"}
                onPress={() => unfold($, "ctx")}
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

  on("command.run", { command: "limit" }, async ($, e) => ({
    text: await limitCommandRun($, e.args),
  }));

  // There is no call that unfolds a band the person folded; a redraw is what a plugin has.
  on("command.run", { command: "band" }, async ($) => {
    $.ui.invalidate("ui.render");
    return {
      text: "kit band drawn above the prompt. Folded ([+])? ctrl+x ctrl+a unfolds it.",
    };
  });
}
