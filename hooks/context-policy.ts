// When the main chat compacts itself, pure: at a task boundary (no open flow task, the turn did
// not end on a question), with the context at or above half the window capped at an absolute
// limit, and not within a few turns of the last compaction. auto-compact.ts wires it; the
// ledger of compactions lets the threshold be tuned from data.

export const SHARE = 0.5;
export const ABSOLUTE = 160_000;
export const COOLDOWN_TURNS = 3;
export const LEDGER_CAP = 50;

export const threshold = (window: number): number =>
  window > 0 ? Math.min(window * SHARE, ABSOLUTE) : ABSOLUTE;

export type Decision = {
  compact: boolean;
  reason: "off" | "no boundary" | "no reading" | "cooldown" | "below" | "over";
};

export function shouldCompact(i: {
  on: boolean;
  boundary: boolean;
  used: number;
  window: number;
  turn: number;
  lastCompactTurn: number | undefined;
}): Decision {
  if (!i.on) return { compact: false, reason: "off" };
  if (!i.boundary) return { compact: false, reason: "no boundary" };
  if (!(i.used > 0)) return { compact: false, reason: "no reading" };
  if (
    i.lastCompactTurn !== undefined &&
    i.turn - i.lastCompactTurn < COOLDOWN_TURNS
  )
    return { compact: false, reason: "cooldown" };
  return i.used >= threshold(i.window)
    ? { compact: true, reason: "over" }
    : { compact: false, reason: "below" };
}

// The answer waits on the user: a question mark at the end, past closing markdown, quotes,
// brackets, emoji and a short parenthetical such as "(ja/nee)"; a closing parenthetical that
// is itself a question ("(Zal ik ook committen?)") counts too.
export function endsOnQuestion(text: string | undefined): boolean {
  // Only the tail matters, and a bounded input keeps the patterns below linear enough.
  let t = (text ?? "").slice(-200).trim();
  for (let prev = ""; prev !== t; ) {
    prev = t;
    const aside = /\s*\(([^()\n]{0,80})\)$/.exec(t);
    if (aside?.[1]?.trim().endsWith("?")) return true;
    t = t
      .replace(/\s*\([^()\n]{0,40}\)$/, "")
      .replace(/[\s*_`"'\u201d\u2019)\]\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+$/u, "");
  }
  return t.endsWith("?");
}

// The host refused because the user already started the next turn: skip, try at the next boundary.
export const isBusy = (err: unknown): boolean =>
  /turn is running/i.test(String(err));

// One completed compaction. `kit`: started by this policy; before/after: native token counts,
// absent when core gave none (a reused precomputed summary).
export type Row = {
  at: number;
  trigger: string;
  kit: boolean;
  before?: number;
  after?: number;
};

export const addRow = (rows: readonly Row[], row: Row): Row[] =>
  [...rows, row].slice(-LEDGER_CAP);

const k = (n: number | undefined) =>
  n === undefined ? "?" : `${Math.round(n / 1000)}k`;

export function ledgerText(rows: readonly Row[], max = 5): string {
  if (!rows.length) return "no compactions recorded yet";
  return [...rows]
    .reverse()
    .slice(0, max)
    .map(
      (r) =>
        `${new Date(r.at).toISOString().slice(0, 16).replace("T", " ")} ` +
        `${r.kit ? "kit" : r.trigger} ${k(r.before)} → ${k(r.after)}`,
    )
    .join("\n");
}
