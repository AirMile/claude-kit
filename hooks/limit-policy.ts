// When to pause before a plan limit runs out, and when keeping the cache warm pays. Pure: no
// `$` (limit-guard.ts applies it).
//
// The percentage is account-wide, so the rise between two of this session's readings also
// counts what other chats and agents spent meanwhile. The pause point drops by three such
// rises (they may land before the next reading), and two points stay free for keep-alives.

export type Reading = { kind: string; percentUsed: number; resetsAt?: string };

// Only the 5-hour window pauses: a weekly pause would last days, so the week is left to the user.
const WINDOWS = ["five_hour"];
const KEEP_FREE = 2; // points left for keep-alive pings
const MIN_MARGIN = 3;
const MIN_STOP = 90; // never pause earlier than this
export const PING_EVERY_MS = 50 * 60_000; // inside the 1-hour cache lifetime
export const CACHE_LIFE_MS = 60 * 60_000; // later than this a ping would rebuild, not renew
export const PING_HORIZON_MS = 5 * 60 * 60_000; // further away, a cold start is cheaper

export function stopAt(rises: readonly number[]): number {
  const worst = Math.max(0, ...rises);
  const margin = Math.max(MIN_MARGIN, Math.ceil(3 * worst));
  return Math.max(MIN_STOP, 100 - margin - KEEP_FREE);
}

// The windows still running (a reading whose reset has passed is stale) that reached `limit`;
// the pause lasts until the last of them resets.
export function overLimit(
  readings: readonly Reading[],
  limit: number,
  now: number,
): { until: number; percent: number } | null {
  let hit: { until: number; percent: number } | null = null;
  for (const r of readings) {
    if (!WINDOWS.includes(r.kind) || !r.resetsAt) continue;
    const until = Date.parse(r.resetsAt);
    if (!(until > now) || r.percentUsed < limit) continue;
    if (!hit || until > hit.until) hit = { until, percent: r.percentUsed };
  }
  return hit;
}

// The rise of one window since the last reading of the same window period; null when the
// window reset in between or there is no earlier reading.
export function rise(before: Reading | undefined, now: Reading): number | null {
  if (!before || before.resetsAt !== now.resetsAt) return null;
  const d = now.percentUsed - before.percentUsed;
  return d > 0 ? d : null;
}

export const shouldPing = (until: number, now: number): boolean =>
  until - now <= PING_HORIZON_MS && until - now > PING_EVERY_MS / 5;

export const ALWAYS_FOR_MS = 24 * 60 * 60_000; // Warm stops after this long without a turn

// What keep-warm.ts knows when an idle tick asks whether to ping.
export type WarmState = {
  hold: Hold;
  openWork: boolean; // the last turn ended with background work or a wake-up pending
  pauseUntil: number | null; // a plan-limit pause, until its reset
  pauseRefused: boolean; // a ping during the pause hit the limit
  lastTurn: number; // when the chat last ended a turn
  lastActive: number; // when the cache was last renewed (a request or a ping)
};

// Only in the last 10 minutes of the cache's hour: earlier it is still warm, later (a laptop
// that slept) it is already cold and a ping would pay the full rebuild for nobody. Then a
// pause stays warm while its reset is near, Limit while work is still open, Warm until a
// day without a turn, Off never.
export function wantsPing(s: WarmState, now: number): boolean {
  const idle = now - s.lastActive;
  if (idle < PING_EVERY_MS || idle >= CACHE_LIFE_MS) return false;
  if (s.pauseUntil !== null)
    return !s.pauseRefused && shouldPing(s.pauseUntil, now);
  if (s.hold === "warm") return now - s.lastTurn < ALWAYS_FOR_MS;
  return s.hold === "pause" && s.openWork;
}

// `14:05` for today, `Fri 14:05` further away: when work resumes.
export function clockTime(at: number, now: number): string {
  const d = new Date(at);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay
    ? hm
    : `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${hm}`;
}

// The band's limit button, a setting per chat: off (no pause, no pings), pause (the cache kept
// warm while work is open: a pause, background work, a wake-up), or warm (also whenever the
// chat is idle, up to ALWAYS_FOR_MS). Kept in $.store per session id, the newest MAX_HOLDS.
export type Hold = "off" | "pause" | "warm";
export const HOLDS: readonly Hold[] = ["off", "pause", "warm"];
export const DEFAULT_HOLD: Hold = "pause";
const MAX_HOLDS = 20;

const isHold = (v: unknown): v is Hold => HOLDS.includes(v as Hold);

export const nextHold = (h: Hold): Hold =>
  HOLDS[(HOLDS.indexOf(h) + 1) % HOLDS.length] ?? DEFAULT_HOLD;

function holds(stored: unknown): Record<string, Hold> {
  const out: Record<string, Hold> = {};
  if (!stored || typeof stored !== "object") return out;
  for (const [id, v] of Object.entries(stored)) if (isHold(v)) out[id] = v;
  return out;
}

export const holdOf = (stored: unknown, id: string): Hold =>
  holds(stored)[id] ?? DEFAULT_HOLD;

export function withHold(
  stored: unknown,
  id: string,
  h: Hold,
): Record<string, Hold> {
  const all = holds(stored);
  delete all[id];
  all[id] = h;
  return Object.fromEntries(Object.entries(all).slice(-MAX_HOLDS));
}
