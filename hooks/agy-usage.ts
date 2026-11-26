import type { EngineInterface } from "claude-code";

import { agyStatus } from "./agy-run";
import type { Meters } from "./delegate-policy";

// Gemini's plan meters for the band: `agy --print=/usage` answers headless, without a model run
// or tokens. Read at most every 10 minutes. A run that succeeds with anything but the usage
// command's own answer (an agy that hands `/usage` to a model) ends the reading for this
// session, so it never spends quota.

const FRESH_MS = 10 * 60_000;

type Bucket = { id?: string; remaining_fraction?: number; reset_time?: string };
type Answer = {
  command?: { name?: string; data?: { groups?: { buckets?: Bucket[] }[] } };
};

// The usage command's own answer; undefined for any other output.
function usageAnswer(stdout: string): Answer["command"] {
  try {
    const o = JSON.parse(stdout.slice(stdout.indexOf("{"))) as Answer;
    return o.command?.name === "usage" ? o.command : undefined;
  } catch {
    return undefined;
  }
}

// Gemini's two windows as percent used; agy's other group (its Claude and GPT) is left out.
export function parseAgyUsage(stdout: string): Meters | undefined {
  const buckets = (usageAnswer(stdout)?.data?.groups ?? []).flatMap(
    (g) => g.buckets ?? [],
  );
  const out: Meters = {};
  for (const [id, kind] of [
    ["gemini-5h", "five_hour"],
    ["gemini-weekly", "seven_day"],
  ] as const) {
    const b = buckets.find((x) => x.id === id);
    if (typeof b?.remaining_fraction === "number")
      out[kind] = {
        pct: Math.round((1 - b.remaining_fraction) * 100),
        resetsAt: b.reset_time,
      };
  }
  return out.five_hour || out.seven_day ? out : undefined;
}

let meters: Meters | undefined;
let readAt: number | undefined;
let stopped = false;
let reading: Promise<boolean> | undefined;

export const geminiCached = (): Meters | undefined => meters;

async function read($: EngineInterface): Promise<boolean> {
  const now = await $.clock.now();
  if (stopped || (readAt !== undefined && now - readAt < FRESH_MS))
    return false;
  const { path } = await agyStatus($);
  if (!path) return false;
  readAt = now;
  const ran = await $.process
    .run(
      [path, "--mode", "plan", "--output-format", "json", "--print=/usage"],
      { timeoutMs: 30_000 },
    )
    .catch(() => undefined);
  const ok = ran?.exitCode === 0;
  stopped = ok && !usageAnswer(ran.stdout);
  meters = ok ? parseAgyUsage(ran.stdout) : undefined;
  return true;
}

// Reads when the last reading is old; true when it read, so the band can draw it.
export function readGemini($: EngineInterface): Promise<boolean> {
  reading ??= read($)
    .catch(() => false)
    .finally(() => {
      reading = undefined;
    });
  return reading;
}
