// The feedback inbox's rules: Skill Feedback points raised after a kit skill run, in any
// project, kept until /improve handles them. Pure, like spec.ts: feedback-inbox.ts makes the
// calls ($.store, one key per point so parallel sessions never overwrite each other).

export const PREFIX = "feedback:"; // $.store: `feedback:<id>` → Point
export const MAX_TEXT = 500;

export type Point = {
  skill: string;
  text: string;
  project: string;
  at: number;
};
export type Request =
  | { action: "add"; skill: string; text: string }
  | { action: "list"; skill?: string }
  | { action: "done"; ids: string[] };

const word = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// The tool's input → a request, or what is wrong with it (the tool's answer).
export function validate(e: Record<string, unknown>): Request | string {
  const skill = word(e.skill);
  if (e.action === "add") {
    const text = word(e.text);
    if (!skill) return "skill is required: the kit skill the point is about";
    if (!text) return "text is required: the point itself";
    if (text.length > MAX_TEXT) return `text is over ${MAX_TEXT} characters`;
    return { action: "add", skill, text };
  }
  if (e.action === "list") {
    if (e.skill === undefined) return { action: "list" };
    return skill ? { action: "list", skill } : "skill must be a skill name";
  }
  if (e.action === "done") {
    const ids = Array.isArray(e.ids) ? e.ids.map(word) : [];
    if (
      !ids.length ||
      ids.some((id) => !id) ||
      ids.length !== (e.ids as []).length
    )
      return 'ids must be a list of point ids, such as ["#k2x9ab"]';
    return { action: "done", ids: ids.map((id) => id.replace(/^#/, "")) };
  }
  return 'action must be "add", "list" or "done"';
}

export const normalise = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

// The id of an open point with the same skill and text, or null.
export function duplicate(
  points: Record<string, Point>,
  skill: string,
  text: string,
): string | null {
  const want = normalise(text);
  const hit = Object.entries(points).find(
    ([, p]) => p.skill === skill && normalise(p.text) === want,
  );
  return hit?.[0] ?? null;
}

const oldestFirst = (points: Record<string, Point>) =>
  Object.entries(points).sort(([, a], [, b]) => a.at - b.at);
const dirName = (path: string) =>
  path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || path;

// `#<id> · <skill> · <project dir> · <YYYY-MM-DD> · <text>`, one line per open point.
export function lines(points: Record<string, Point>, skill?: string): string {
  const shown = oldestFirst(points).filter(
    ([, p]) => !skill || p.skill === skill,
  );
  if (!shown.length) return skill ? `Inbox empty for ${skill}` : "Inbox empty";
  return shown
    .map(
      ([id, p]) =>
        `#${id} · ${p.skill} · ${dirName(p.project)} · ` +
        `${new Date(p.at).toISOString().slice(0, 10)} · ${p.text}`,
    )
    .join("\n");
}

// The open count and the skill with the most points (a tie: whose oldest waited longest).
export function summary(points: Record<string, Point>) {
  const per = new Map<string, number>();
  for (const [, p] of oldestFirst(points))
    per.set(p.skill, (per.get(p.skill) ?? 0) + 1);
  let top: string | null = null;
  for (const [skill, n] of per) if (!top || n > per.get(top)!) top = skill;
  return { count: Object.keys(points).length, top };
}

// The status line's text in a kit checkout ($.ui.status puts "kit:" before it).
export function statusText(points: Record<string, Point>): string | undefined {
  const { count, top } = summary(points);
  if (!count) return undefined;
  return `${count} feedback point${count === 1 ? "" : "s"} · /improve ${top}`;
}

// A short id: the time in base 36 plus three random characters.
export const newId = (now: number, rand: number) =>
  now.toString(36) +
  Math.floor(rand * 36 ** 3)
    .toString(36)
    .padStart(3, "0");
