// docs/roadmap.md, read and edited line by line (format: skills/roadmap/SKILL.md § Formats).
// Pure: text in, text out; every line the edit doesn't touch is kept byte for byte.
// Edits refuse done and in-progress items: their state belongs to /build.

export type Item = {
  slug: string;
  description: string;
  done: boolean;
  spec?: string;
  phase: string;
  line: number;
};
export type Roadmap = { items: Item[]; phases: string[]; later: string[] };

const ITEM = /^- \[( |x)\] \*\*([^*]+)\*\* · (.*?)(?: · spec: (\S+))?\s*$/i;
const HEADING = /^## (.+?)\s*$/;

export function parse(text: string): Roadmap {
  const out: Roadmap = { items: [], phases: [], later: [] };
  let phase = "";
  let inComment = false;
  let inLater = false;
  text.split("\n").forEach((raw, line) => {
    if (inComment || raw.startsWith("<!--")) {
      inComment = !raw.includes("-->");
      return;
    }
    const heading = HEADING.exec(raw)?.[1];
    if (heading) {
      inLater = /^later$/i.test(heading);
      if (!inLater) out.phases.push((phase = heading));
      return;
    }
    if (inLater) {
      if (raw.startsWith("- ")) out.later.push(raw.slice(2));
      return;
    }
    const m = ITEM.exec(raw);
    if (m?.[2])
      out.items.push({
        slug: m[2],
        description: m[3] ?? "",
        done: m[1] === "x",
        spec: m[4],
        phase,
        line,
      });
  });
  return out;
}

export const isEditable = (item: Item) => !item.done && !item.spec;
export const toLine = (slug: string, description: string) =>
  `- [ ] **${slug}** · ${description}`;
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("-");

function editable(r: Roadmap, slug: string): Item {
  const item = r.items.find((i) => i.slug === slug);
  if (!item) throw new Error(`no roadmap item "${slug}"`);
  if (!isEditable(item))
    throw new Error(`"${slug}" is done or in progress: /build owns it`);
  return item;
}

// The line index after which a new item of `phase` goes: its last item, else its heading.
function endOf(lines: string[], r: Roadmap, phase: string): number {
  const last = r.items.filter((i) => i.phase === phase).at(-1);
  if (last) return last.line;
  const heading = lines.findIndex((l) => HEADING.exec(l)?.[1] === phase);
  if (heading < 0) throw new Error(`no phase "${phase}"`);
  return lines[heading + 1] === "" ? heading + 1 : heading;
}

export function add(text: string, phase: string, title: string): string {
  const r = parse(text);
  const lines = text.split("\n");
  const slug = slugify(title);
  if (!slug) throw new Error("empty title");
  if (r.items.some((i) => i.slug === slug))
    throw new Error(`"${slug}" already exists`);
  lines.splice(endOf(lines, r, phase) + 1, 0, toLine(slug, title.trim()));
  return lines.join("\n");
}

export function movePhase(text: string, slug: string, phase: string): string {
  const r = parse(text);
  const item = editable(r, slug);
  if (item.phase === phase) return text;
  if (!r.phases.includes(phase)) throw new Error(`no phase "${phase}"`);
  const lines = text.split("\n");
  const [raw = ""] = lines.splice(item.line, 1);
  lines.splice(endOf(lines, parse(lines.join("\n")), phase) + 1, 0, raw);
  return lines.join("\n");
}

export function remove(text: string, slug: string): string {
  const item = editable(parse(text), slug);
  const lines = text.split("\n");
  lines.splice(item.line, 1);
  return lines.join("\n");
}

export function toLater(text: string, slug: string): string {
  const item = editable(parse(text), slug);
  return appendLater(remove(text, slug), `${item.slug}: ${item.description}`);
}

// A new idea at the end of `## Later` (made when missing).
export function addLater(text: string, idea: string): string {
  if (!idea.trim()) throw new Error("empty idea");
  return appendLater(text, idea.trim());
}

function appendLater(text: string, line: string): string {
  const lines = text.split("\n");
  const later = lines.findIndex((l) => /^## later\s*$/i.test(l));
  const idea = `- ${line}`;
  if (later < 0) {
    while (lines.at(-1) === "") lines.pop();
    lines.push("", "## Later", "", idea, "");
  } else {
    let end = later + 1;
    while (end < lines.length && !HEADING.test(lines[end] ?? "")) end++;
    while (end > later + 1 && lines[end - 1] === "") end--;
    lines.splice(end, 0, idea);
  }
  return lines.join("\n");
}

// A `## Later` idea back onto the roadmap, at the end of `phase` ("slug: description" or free text).
export function restore(text: string, index: number, phase: string): string {
  const lines = text.split("\n");
  const later = lines.findIndex((l) => /^## later\s*$/i.test(l));
  const at = lines.findIndex(
    (l, i) => i > later && l.startsWith("- ") && index-- === 0,
  );
  if (later < 0 || at < 0) throw new Error("no such Later idea");
  const idea = (lines[at] ?? "").slice(2);
  const [, slug, description] = /^([a-z0-9-]+): (.+)$/.exec(idea) ?? [];
  lines.splice(at, 1);
  const rest = lines.join("\n");
  const r = parse(rest);
  if (!slug || !description) return add(rest, phase, idea);
  if (r.items.some((i) => i.slug === slug))
    throw new Error(`"${slug}" already exists`);
  const out = rest.split("\n");
  out.splice(endOf(out, r, phase) + 1, 0, toLine(slug, description));
  return out.join("\n");
}
