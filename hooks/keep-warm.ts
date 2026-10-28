import type { CommandSpec, EngineInterface } from "claude-code";

import {
  DEFAULT_HOLD,
  type Hold,
  wantsPing,
} from "./limit-policy";

// Keeps this chat's prompt cache warm: after 50 idle minutes (the cache lives an hour) a
// tiny fork of the chat ("reply with only ok") reads the whole cached prefix again, which
// renews it. Each ping costs a cache read of the context, never zero. When, the band's limit
// button decides (limit-guard.ts mirrors it here with syncHold; wantsPing in limit-policy.ts):
// - Limit: while work is open, a plan-limit pause near its reset (limit-guard.ts) or a turn
//   that ended with background work or a wake-up pending (noteStop, from classic.Stop);
// - Warm (or /warm): whenever the chat is idle, until a day without a turn.

export const warmCommand: CommandSpec = {
  name: "warm",
  description: "Keep this chat's prompt cache warm while it is idle (on/off)",
  argumentHint: "[on|off]",
  immediate: true,
};

const PING_PROMPT =
  "Keep-alive ping from the kit plugin to keep this chat's prompt cache warm. " +
  "Reply with only: ok";
const TICK_MS = 5 * 60_000; // a ping lands within 55 idle minutes

type Timer = ReturnType<EngineInterface["clock"]["after"]>;

let hold: Hold = DEFAULT_HOLD; // this chat's, set by limit-guard.ts
let openWork = false;
let lastTurn = 0; // when the chat last ended a turn
let pauseUntil: number | null = null; // set while limit-guard holds the chat
let pauseRefused = false; // a ping during the pause hit the limit: no more
let lastActive = 0; // when the chat last made a request
let pings = 0;
let pinging = false; // a ping's own turn end is not the chat's
let ticker: Timer | null = null;

// A response arrived (session.measure): the cache was just renewed.
export async function noteActive($: EngineInterface) {
  lastActive = await $.clock.now();
}

// A main-chat turn ended (classic.Stop): is work still open that will wake it?
export async function noteStop($: EngineInterface, open: boolean) {
  if (pinging) return;
  lastTurn = await $.clock.now();
  openWork = open;
  if (open) ensureTicker($);
}

export const warmHold = () => hold;

// Limit starts the ticker once work is open (noteStop, warmForPause); Warm at once.
export function syncHold($: EngineInterface, next: Hold) {
  hold = next;
  if (next === "warm") ensureTicker($);
}

export function warmForPause($: EngineInterface, until: number) {
  pauseUntil = until;
  pauseRefused = false;
  ensureTicker($);
}

export function endPauseWarm() {
  pauseUntil = null;
}

// How often the cache was kept warm, on the band's limit button; empty before the first ping.
export const warmInfo = () => (pings ? ` ♨×${pings}` : "");

function ensureTicker($: EngineInterface) {
  if (!ticker) ticker = $.clock.every(TICK_MS, () => void tick($));
}

async function tick($: EngineInterface) {
  const now = await $.clock.now();
  lastActive ||= now; // no request or turn yet since a reload: count from here
  lastTurn ||= now;
  const state = { hold, openWork, pauseUntil, pauseRefused, lastTurn, lastActive };
  if (pinging || !wantsPing(state, now)) return;
  pinging = true;
  const r = await $.model
    .fork({ prompt: PING_PROMPT })
    .catch(() => null)
    .finally(() => (pinging = false));
  if (r?.isAnswered) {
    lastActive = now;
    pings += 1;
  } else if (r?.reason === "api-error") {
    // The limit (or the API) refused it: retrying every 5 minutes would not help.
    // Warm drops back to Limit; limit-guard.ts sees that and stores it.
    if (pauseUntil !== null) pauseRefused = true;
    else if (hold === "warm") {
      hold = "pause";
      $.ui.toast("kit: keep warm stopped, a ping failed (api error).");
    } else openWork = false;
  }
  $.ui.invalidate("ui.render");
}
