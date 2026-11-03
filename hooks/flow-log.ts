import type { Change, Task, Track } from "./flow-policy";
import { TRACKS } from "./flow-policy";
import type { Kind } from "./model-policy";

// Flow's log, pure: what it picked and held, kept 14 days in $.store, and /flow's report. A
// count alone can't say whether a pick was right, so each task's end records its first and
// last track, files, checks and verifier, and the user marks a pick too heavy or too light, a
// hold right or wrong.

export type Mark = "too-heavy" | "too-light" | "hold-right" | "hold-wrong";
export const MARKS: readonly Mark[] = [
  "too-heavy",
  "too-light",
  "hold-right",
  "hold-wrong",
];
export type Ending =
  "verified" | "unresolved" | "unverified" | "no change" | "reset" | "waived";

export type LogEntry = {
  at: number;
  task?: number;
  event: string; // task events, decision, levels, read-note, delegate
  text: string; // the prompt's first 60 characters, or the files it is about
  track?: Track;
  first?: Track;
  kind?: Kind;
  change?: Change;
  reason?: string; // what grew a task or what a hold missed
  files?: number;
  spec?: boolean;
  checks?: number;
  failed?: number;
  verifier?: "pass" | "fail";
  holds?: number;
  outcome?: Ending | "ok" | "failed";
  provider?: "gpt" | "claude" | "none";
  durationMs?: number;
  mark?: Mark;
  levels?: string; // task-policy's levels, as the band shows them ("D1 E1 V1")
  claude5h?: number; // both 5h meters when the levels were decided
  gpt5h?: number;
};

export const KEEP_MS = 14 * 86_400_000;
export const LOG_MAX = 2000;

export const keep = (log: readonly LogEntry[], entry: LogEntry): LogEntry[] =>
  [...log.filter((e) => entry.at - e.at < KEEP_MS), entry].slice(-LOG_MAX);

export function endEntry(t: Task, outcome: Ending, at: number): LogEntry {
  return {
    at,
    task: t.id,
    event: "end",
    text: t.files.slice(0, 3).join(", "),
    first: t.first,
    track: t.track,
    files: t.files.length,
    spec: t.spec,
    checks: t.checks,
    failed: t.failed,
    verifier: t.verifier,
    holds: t.blocks,
    outcome,
  };
}

const NOTABLE = new Set(["start", "escalate", "block", "end"]);
// The last ten picks and holds, newest first, as /flow numbers them.
export const notable = (log: readonly LogEntry[]): LogEntry[] =>
  log
    .filter((e) => NOTABLE.has(e.event))
    .slice(-10)
    .reverse();

// The log with the user's mark on the n-th of /flow's list, or undefined for no such entry.
export function marked(
  log: readonly LogEntry[],
  n: number,
  mark: Mark,
): LogEntry[] | undefined {
  const target = notable(log)[n - 1];
  if (!target) return undefined;
  return log.map((e) => (e === target ? { ...e, mark } : e));
}

const line = (e: LogEntry, n: number): string => {
  const what =
    e.event === "end"
      ? `end ${e.track}${e.first !== e.track ? ` (from ${e.first})` : ""} · ${e.files} files · ` +
        `${e.checks} checks${e.failed ? ` (${e.failed} failed)` : ""}` +
        `${e.verifier ? ` · verifier ${e.verifier}` : ""} · ${e.outcome}`
      : `${e.event}${e.track ? ` ${e.track}` : ""}${e.change ? ` (asked ${e.change}, ${e.kind})` : ""}` +
        `${e.reason ? ` · ${e.reason}` : ""}`;
  return `  ${n}. ${what}: ${e.text || "-"}${e.mark ? ` [${e.mark}]` : ""}`;
};

const levelOf = (e: LogEntry, system: string): number | undefined => {
  const m = e.levels?.match(new RegExp(`${system}(\\d)`));
  return m ? Number(m[1]) : undefined;
};

// The decisions per level, and how many that wanted GPT to execute (E1+) saw a GPT run before
// the next decision: whether the note alone moves work to GPT.
export function decisionLines(log: readonly LogEntry[]): string[] {
  const decisions = log.filter((e) => e.event === "decision");
  if (!decisions.length) return ["decisions: none yet"];
  const per = (system: string, top: number) =>
    Array.from({ length: top + 1 }, (_, n) => {
      const c = decisions.filter((e) => levelOf(e, system) === n).length;
      return `${system}${n} ${c}`;
    }).join(" ");
  let wanted = 0;
  let ran = 0;
  log.forEach((e, i) => {
    if (e.event !== "decision" || (levelOf(e, "E") ?? 0) < 1) return;
    wanted++;
    const after = log.slice(i + 1);
    const end = after.findIndex((n) => n.event === "decision");
    if (
      (end < 0 ? after : after.slice(0, end)).some(
        (n) => n.event === "delegate" && n.provider === "gpt",
      )
    )
      ran++;
  });
  return [
    `decisions ${decisions.length}: ${per("D", 3)} · ${per("E", 3)} · ${per("V", 3)} · ` +
      `raised ${log.filter((e) => e.event === "levels").length}`,
    `E1+ decisions with a GPT run: ${ran} of ${wanted}`,
  ];
}

// /flow's report: the first picks against how the tasks ended, the holds, the user's marks.
export function report(log: readonly LogEntry[]): string {
  const ends = log.filter((e) => e.event === "end");
  const delegates = log.filter((e) => e.event === "delegate");
  const delegated = delegates.filter(
    (e) => e.outcome === "ok" && e.provider !== "none",
  );
  const count = (f: (e: LogEntry) => boolean, of: readonly LogEntry[] = log) =>
    of.filter(f).length;
  const lines = [
    "kit flow",
    log.length
      ? `log: ${log.length} entries since ${new Date(log[0]!.at).toISOString().slice(0, 10)} (kept 14 days)`
      : "log: empty",
    `tasks by first pick: ${TRACKS.map((t) => `${t} ${count((e) => e.event === "start" && e.track === t)}`).join(" · ")}`,
    `grew after the first pick (too light?): ${count((e) => e.first !== e.track, ends)} · heavy ` +
      `ending with 2 files or fewer and no spec (too heavy?): ${count((e) => e.first === "heavy" && (e.files ?? 0) <= 2 && !e.spec, ends)}`,
    `holds ${count((e) => e.event === "block")} · ended ${(["verified", "waived", "unresolved", "unverified"] as const).map((o) => `${o} ${count((e) => e.outcome === o, ends)}`).join(" · ")}`,
    `your marks: ${MARKS.map((m) => `${m} ${count((e) => e.mark === m)}`).join(" · ")}`,
    ...decisionLines(log),
    `read notes ${count((e) => e.event === "read-note")} · delegated ${delegated.length} (gpt ${count((e) => e.provider === "gpt", delegated)}, claude ${count((e) => e.provider === "claude", delegated)}) · not delegated ${count((e) => e.provider === "none", delegates)} · failed ${count((e) => e.provider !== "none" && e.outcome === "failed", delegates)}`,
  ];
  const last = notable(log);
  if (last.length) lines.push("last:", ...last.map((e, i) => line(e, i + 1)));
  lines.push(`Mark one: /flow mark <n> ${MARKS.join("|")}.`);
  return lines.join("\n");
}
