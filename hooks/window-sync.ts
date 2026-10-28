import type { EngineInterface, SessionRateLimit } from "claude-code";

import {
  gptCached,
  gptOn,
  gptStatus,
  runCodex,
  type GptStatus,
  type Run,
} from "./codex-run";
import { newest } from "./delegate-policy";
import { clockTime } from "./limit-policy";
import { newWindow, shouldPing } from "./window-sync-policy";

// Starts ChatGPT's 5h window together with Claude's: when a Claude window is new and ChatGPT's
// is idle, one tiny read-only Codex request (the newest Luna, effort low, ephemeral), so both
// reset together. Once per Claude window, across sessions: its start is kept in $.store before
// the request goes out. Runs in the background of a measure; a failure is kept for /gpt only.

const SYNC_KEY = "windowSync";
const PING_MS = 60_000;
const CONFIRM_MS = 60_000; // an idle reading older than this is read again before a ping
const BRIEF = "Reply with: ok";

type Sync = { start: number; at: number; ok?: boolean };

let busy = false;
let refreshedFor: number | undefined; // the Claude window ChatGPT's status was read again for

async function lastSync($: EngineInterface): Promise<Sync | undefined> {
  const v = await $.store.get(SYNC_KEY).catch(() => undefined);
  return v && typeof v === "object" && typeof (v as Sync).start === "number"
    ? (v as Sync)
    : undefined;
}

// /gpt's line: when the last ping went out, or that it failed.
export async function syncLine($: EngineInterface): Promise<string> {
  const last = await lastSync($);
  if (!last) return "window sync: —";
  const when = clockTime(last.at, await $.clock.now());
  return last.ok === false
    ? `window sync: failed at ${when}`
    : `window sync: ${when}`;
}

export async function syncWindows(
  $: EngineInterface,
  readings: readonly SessionRateLimit[],
) {
  if (busy) return;
  busy = true;
  try {
    await sync($, readings);
  } catch {
    // a sync is a nicety: never let it reach the turn
  } finally {
    busy = false;
  }
}

async function sync($: EngineInterface, readings: readonly SessionRateLimit[]) {
  const r = readings.find((x) => x.kind === "five_hour");
  const claude = r && { pct: r.percentUsed, resetsAt: r.resetsAt };
  const now = await $.clock.now();
  const synced = (await lastSync($))?.start;
  const start = newWindow(claude, now, synced);
  if (start === undefined || !(await gptOn($))) return;
  const decide = (st: GptStatus | undefined) =>
    st?.argv && !st.error
      ? shouldPing({
          claude,
          gpt: st.limits.five_hour,
          gptReadAt: st.at,
          now,
          synced,
        }).ping
      : false;
  let st = gptCached();
  if (!decide(st)) {
    // The cached reading may be up to 10 minutes old: read once more per Claude window.
    if (refreshedFor === start) return;
    refreshedFor = start;
    st = await gptStatus($, true);
  } else if (now - st!.at > CONFIRM_MS) st = await gptStatus($, true); // idle then, still now?
  if (!decide(st)) return;
  const luna = newest(st!.models).luna;
  if (!luna || !st?.argv) return;
  // Another session may have claimed this window while Codex was read, or GPT went off.
  if (newWindow(claude, now, (await lastSync($))?.start) === undefined) return;
  if (!(await gptOn($))) return;
  const at = await $.clock.now();
  await $.store.set(SYNC_KEY, { start, at } satisfies Sync);
  const argv = [
    ...st.argv,
    "exec",
    "--json",
    "--ephemeral",
    "--model",
    luna.id,
    "-c",
    'model_reasoning_effort="low"',
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "-",
  ];
  const root = await $.session.root();
  const run: Run = await runCodex(
    $,
    argv,
    BRIEF,
    root,
    async () => {},
    PING_MS,
  ).catch((err) => ({ answer: "", commands: 0, error: String(err) }));
  const ok = !run.error;
  await $.store.set(SYNC_KEY, { start, at, ok } satisfies Sync).catch(() => {});
  if (!ok) return;
  await gptStatus($, true); // ChatGPT's window now runs: the band shows its reset
  const reset = Date.parse(r!.resetsAt!);
  $.ui.toast(
    `kit: ChatGPT's 5h window now runs with Claude's, both reset at ${clockTime(reset, await $.clock.now())}.`,
    { timeoutMs: 8_000 },
  );
}
