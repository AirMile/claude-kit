import type { EngineInterface, Register, SessionUsage } from "claude-code";

import { readGemini } from "./agy-usage";
import { geminiCommand } from "./gemini-command";
import { geminiOn } from "./gemini-switch";
import { autoModel, modeCommand } from "./auto-model";
import { codexHint, gptOn, gptStatus } from "./codex-run";
import { delegateTool, delegation, gptCommand } from "./delegate";
import { runTaskTool, taskRunner } from "./task-runner";
import { noteClaudeLimits } from "./delegate-balance";
import { commitGate, commitGateCommand } from "./commit-gate";
import { guard, guardCommand } from "./guard";
import {
  flow,
  flowAnswer,
  flowClosed,
  flowCommand,
  flowEdit,
  flowStop,
  flowTurnEnd,
  resetFlow,
} from "./flow";
import {
  afterTurn,
  autoCompact,
  autoCompactCommand,
  noteBoundary,
  resetAutoCompact,
} from "./auto-compact";
import { boundaryOf, endsOnQuestion } from "./context-policy";
import { compaction } from "./compaction";
import { pinCommand, pins } from "./pins";
import { recent } from "./recent";
import { bandCommand, bandUsage, kitBand } from "./kit-band";
import { noteStop, warmCommand } from "./keep-warm";
import { limitCommand } from "./limit-command";
import { leavePause, limitCommandWatch, noteLimits } from "./limit-guard";
import { untilReset, type Usage } from "./band-meters";
import { themeTool, themeView } from "./theme-view";
import { readWatch } from "./read-watch";
import { syncWindows } from "./window-sync";

// kit's context mod. Reads the active spec; never writes.
// - Native compaction priorities and spec recovery (compaction.ts).
// - /pin: the user's own text restored word for word after every compaction (pins).
// - The user's latest messages, restored the same way (recent).
// - Context and plan limits as the band's second line (kit-band.tsx); Gemini's from agy's
//   /usage (agy-usage).
// - The theme pane, whose tool the theme skill calls with data (theme-view).
// - Model and effort picked per prompt and per subagent from a profile (auto-model), chosen
//   in the band above the prompt or with /mode.
// - A pause before the plan limit runs out (limit-guard), and the cache kept warm while work
//   is open or, on Warm, while the chat is idle (keep-warm); the band's limit button or
//   /warm sets both per chat.
// - delegate: a review or second plan handed to GPT through Codex (on Claude Pro the rest too),
//   ChatGPT's meters in the band while GPT is on, /gpt (delegate).
// - run_task: a GPT change, host checks and repairs on the same thread (task-runner).
// - flow: each change task's track, its notes and the check before a turn ends, /flow (flow).
// - window sync: ChatGPT's 5h window started with a new Claude one (window-sync).

type Figures = Pick<SessionUsage, "context" | "rateLimits">;
type Meter = Usage;

const SPEC_PATH = /docs\/specs\/[^/]+\.md$/;

let meters: Meter[] = [];

async function refresh($: EngineInterface, figures?: Figures) {
  const usage = figures ?? (await $.session.usage());
  const pct = usage.context.percent;
  const now = await $.clock.now();
  noteClaudeLimits(usage.rateLimits, now);
  meters = [
    {
      label: "ctx",
      pct: pct ?? 0,
      value: `${Math.round((usage.context.tokens ?? 0) / 1000)}k`,
    },
  ];
  for (const [kind, label] of [
    ["five_hour", "5h"],
    ["seven_day", "wk"],
  ] as const) {
    const rl = usage.rateLimits.find((r) => r.kind === kind);
    if (rl)
      meters.push({
        label,
        value: `${Math.round(rl.percentUsed)}%`,
        pct: rl.percentUsed,
        note: untilReset(rl.resetsAt, now),
      });
  }
  // The other plans' windows are drawn by the band from what was last read (kit-band.tsx):
  // here they are only read again when old, while their switch is on.
  if (await gptOn($)) void gptStatus($);
  // Only rings show Gemini, so agy is asked only where a surface draws them; in the
  // background, and a new reading is drawn as it arrives.
  const surfaces = await $.session.surfaces().catch(() => []);
  if (surfaces.some((s) => s !== "terminal") && (await geminiOn($)))
    void readGemini($)
      .then((read) => (read ? refresh($) : undefined))
      .catch(() => {});
  bandUsage(meters);
  $.ui.invalidate("ui.render");
}

export const register: Register = (on) => {
  themeView(on);
  readWatch(on);
  delegation(on);
  taskRunner(on);
  guard(on);
  commitGate(on);
  flow(on);
  autoModel(on);
  kitBand(on);
  compaction(on);
  autoCompact(on);
  pins(on);
  recent(on);

  on("session.start", async ($, e, next) => {
    const started = await next(e);
    await $.tool.register(themeTool);
    await $.tool.register(delegateTool);
    await $.tool.register(runTaskTool);
    await $.command.register(modeCommand);
    await $.command.register(warmCommand);
    await $.command.register(limitCommand).catch((err) => {
      $.ui.toast(`kit: could not register /limit (${String(err)})`);
    });
    await $.command.register(bandCommand);
    await $.command.register(gptCommand);
    // A generic name, like /pin: another plugin holding it must not stop session start.
    await $.command.register(geminiCommand).catch((err) => {
      $.ui.toast(`kit: could not register /gemini (${String(err)})`);
    });
    await $.command.register(flowCommand);
    await $.command.register(guardCommand);
    await $.command.register(commitGateCommand);
    await $.command.register(autoCompactCommand);
    // A generic name: another plugin holding /pin must not stop the rest of session start.
    await $.command.register(pinCommand).catch((err) => {
      $.ui.toast(`kit: could not register /pin (${String(err)})`);
    });
    await refresh($);
    if (await gptOn($))
      void gptStatus($).then((st) => {
        if (st.state !== "ready")
          $.ui.toast(`kit: ${codexHint(st)}`, { timeoutMs: 15_000 });
        return refresh($);
      }); // without waiting
    return started;
  });

  // A /clear fires no session.start or measure until the next turn: drop the old context
  // figure now, or the band keeps showing it in the fresh chat.
  on("session.end", async ($, e, next) => {
    if (e.reason === "clear" || e.reason === "resume") leavePause($);
    if (e.reason === "clear") {
      resetAutoCompact();
      await resetFlow($);
      meters = meters.filter((m) => m.label !== "ctx");
      bandUsage(meters);
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  // Every command: a forked one that the plan-limit pause cuts is kept (limit-guard.ts).
  on("command.run", async ($, e, next) => limitCommandWatch($, e, next));

  on("session.measure", async ($, e, next) => {
    await refresh($, e);
    await noteLimits($, e.rateLimits);
    void syncWindows($, e.rateLimits); // in the background: the turn never waits on Codex
    return next(e);
  });

  // A main-chat turn ended: background work or a wake-up still to come keeps the cache warm.
  on("classic.Stop", async ($, e, next) => {
    const ran = await next(e);
    if (e.agent_id) return ran;
    const open = !!e.background_tasks?.length || !!e.session_crons?.length;
    // Flow holds a turn that ends with changes but no check; background work wakes it later.
    const hold =
      open || ran.block
        ? await flowTurnEnd($).then(() => undefined) // its readiness block still counts
        : await flowStop($, e.last_assistant_message);
    noteBoundary(
      boundaryOf({
        goesOn: !!hold || open || !!ran.block,
        closed: flowClosed(),
        question: endsOnQuestion(e.last_assistant_message),
      }),
    );
    if (hold) return { ...ran, block: hold };
    await noteStop($, open);
    return ran;
  });

  // A turn ended: a subagent's answer goes to flow (the verifier's PASS or FAIL, flow-agents.ts);
  // a main-chat answer may let the chat compact itself once idle (auto-compact.ts).
  on("turn.complete", async ($, e, next) => {
    const done = await next(e);
    if (e.agentId) await flowAnswer($, e.agentId, e.answer);
    else if (e.reason === "answer") await afterTurn($);
    return done;
  });

  on("tool.call", { tool: ["Edit", "Write"] }, async ($, e, next) => {
    const ran = await next(e);
    if (SPEC_PATH.test(e.file_path.replace(/\\/g, "/"))) await refresh($);
    if (ran.deny !== undefined || ran.isError) return ran;
    // Flow: the change counts for the open task, a subagent's too; a note rides along when the
    // task grew.
    const note = await flowEdit($, e.file_path, !!e.agentId);
    return note ? { ...ran, context: [...(ran.context ?? []), note] } : ran;
  });
};
