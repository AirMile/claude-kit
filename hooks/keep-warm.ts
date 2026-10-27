import type { CommandSpec, EngineInterface } from "claude-code";

import { PING_EVERY_MS, shouldPing } from "./limit-policy";

// Keeps this chat's prompt cache warm: after 50 idle minutes (the cache lives an hour) a
// tiny fork of the chat ("reply with only ok") reads the whole cached prefix again, which
// renews it. Each ping costs a cache read of the context, never zero.
// - On by hand: the band's limit button (its third setting, limit-guard.ts) or /warm, for a
//   long chat you return to later.
// - During a plan-limit pause (limit-guard.ts): while the reset is near.

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

let warm = false;
let pauseUntil: number | null = null; // set while limit-guard holds the chat
let pauseRefused = false; // a ping during the pause hit the limit: no more
let lastActive = 0; // when the chat last made a request
let pings = 0;
let ticker: Timer | null = null;

// A response arrived (session.measure): the cache was just renewed.
export async function noteActive($: EngineInterface) {
  lastActive = await $.clock.now();
}

export const isWarm = () => warm;

export async function setWarm($: EngineInterface, on: boolean) {
  warm = on;
  if (on && !lastActive) lastActive = await $.clock.now();
  ensureTicker($);
  $.ui.invalidate("ui.render");
}

export function warmForPause($: EngineInterface, until: number) {
  pauseUntil = until;
  pauseRefused = false;
  ensureTicker($);
}

export function endPauseWarm() {
  pauseUntil = null;
}

// The band's note: how often the cache was kept warm, empty before the first ping.
export const warmInfo = () => (pings ? `cache kept warm ×${pings}` : "");

function ensureTicker($: EngineInterface) {
  if (!ticker) ticker = $.clock.every(TICK_MS, () => void tick($));
}

async function tick($: EngineInterface) {
  const now = await $.clock.now();
  if (now - lastActive < PING_EVERY_MS) return;
  const wanted =
    pauseUntil !== null ? !pauseRefused && shouldPing(pauseUntil, now) : warm;
  if (!wanted) return;
  const r = await $.model.fork({ prompt: PING_PROMPT }).catch(() => null);
  if (r?.isAnswered) {
    lastActive = now;
    pings += 1;
  } else if (r?.reason === "api-error") {
    // The limit (or the API) refused it: retrying every 5 minutes would not help.
    if (pauseUntil !== null) pauseRefused = true;
    else {
      warm = false;
      $.ui.toast("kit: keep warm stopped, a ping failed (api error).");
    }
  }
  $.ui.invalidate("ui.render");
}
