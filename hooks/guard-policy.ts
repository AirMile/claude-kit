// The checker guard, pure: which files define "green" (`Protected:` under `## Commands` in
// AGENTS.md) and whether a path or a shell command writes to one. A shell check is a speed bump,
// not a sandbox: it catches the obvious ways to write a file.

const HEADING = /^##\s+Commands\b/i;
const LINE = /^\s*(?:[-*]\s*)?Protected\s*:\s*(.*)$/i;
const NONE = /^(?:—|–|-|none|n\/a|geen)?$/i;

export function parseProtected(agentsMd: string): string[] {
  let inside = false;
  for (const line of agentsMd.split(/\r?\n/)) {
    if (/^##\s/.test(line)) inside = HEADING.test(line);
    const m = inside ? LINE.exec(line) : null;
    if (!m) continue;
    const value = (m[1] ?? "").replace(/`/g, "").trim();
    return NONE.test(value) ? [] : value.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

const norm = (path: string) => path.replace(/\\/g, "/");
const escape = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

// `**` any folders, `*` within a name, `?` one character; a glob without a slash is a name that
// may sit in any folder.
function source(glob: string, text: boolean): string {
  const clean = norm(glob).replace(/^\.\//, "");
  const body = escape(clean)
    .replace(/\*\*\/?/g, "\u0000")
    .replace(/\*/g, text ? "[^/\\s\"';|&]*" : "[^/]*")
    .replace(/\?/g, text ? "[^/\\s\"';|&]" : "[^/]")
    .replace(/\u0000/g, text ? "[^\\s\"';|&]*" : ".*");
  return clean.includes("/") ? body : `(?:.*/)?${body}`;
}

// `path` is relative to the project root.
export function isProtected(path: string, globs: string[]): boolean {
  const rel = norm(path).replace(/^\.\//, "");
  return globs.some((g) => new RegExp(`^${source(g, false)}$`, "i").test(rel));
}

// `.` and `..` segments collapsed and macOS's /private alias dropped, so `src/../e2e/a.ts` and
// /private/var/x are the paths the system will use.
export function clean(path: string): string {
  const parts = norm(path)
    .replace(/^\/private(?=\/(?:var|tmp|etc)\b)/, "")
    .split("/");
  const head = parts[0] === "" || /^[a-z]:$/i.test(parts[0] ?? "") ? parts.shift() : undefined;
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (head === undefined) out.push("..");
    } else out.push(part);
  }
  return head === undefined ? out.join("/") : `${head}/${out.join("/")}`.replace(/\/$/, "");
}

const ABSOLUTE = /^(?:\/|[a-z]:[\\/])/i;

// Relative to the project root; a relative `path` is taken from the root.
export function relativeTo(root: string, path: string): string {
  const r = clean(root).replace(/\/$/, "");
  const p = clean(ABSOLUTE.test(path) ? path : `${r}/${path}`);
  return p.toLowerCase().startsWith(`${r.toLowerCase()}/`)
    ? p.slice(r.length + 1)
    : p;
}

const WRITER = String.raw`(?:>>?\|?|\btee\b|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bsed\s+-[a-zA-Z]*i\b|\bsed\b[^;&|\n]*--in-place|\bof=|\bperl\s+-[a-zA-Z]*i\b|\btruncate\b|\brm\b|\bRemove-Item\b|\bdel\b|\bmv\b|\bMove-Item\b|\binstall\b|\bpatch\b|\bgit\s+(?:checkout|restore|stash|reset|rm|mv|apply)\b)`;

// A command whose writer comes before a protected path in the same segment: reading a file
// first (`cat biome.json > out`) is no write to it.
export function shellWritesProtected(
  command: string,
  globs: string[],
): boolean {
  const segments = norm(command).split(/;|&&|\|\||(?<!>)\|(?!\|)|\n/);
  const at = (g: string) => `(?<![^\\s"'=(/>|])${source(g, true)}(?=$|[\\s"';|&)])`;
  return segments.some((seg) => {
    // A copy writes its last argument: without trailing redirects, a comment or a `&`.
    let tail = seg.replace(/\s+#.*$/, "");
    for (let prev = ""; prev !== tail; ) {
      prev = tail;
      tail = tail
        .replace(/\s*&\s*$/, "")
        .replace(/\s+(?:\d*|&)>>?&?\s*\S+\s*$/, "");
    }
    return globs.some(
      (g) =>
        new RegExp(`${WRITER}[^;&|\\n]*${at(g)}`, "i").test(seg) ||
        new RegExp(`\\b(?:cp|Copy-Item)\\b[^;&|\\n]*${at(g)}["']?\\s*$`, "i").test(tail),
    );
  });
}

export const refusal = (target: string): string =>
  `kit guard: ${target} defines what counts as green and is locked. Do not unlock it or edit it another way. ` +
  "Stop, report which change you need and why; the user decides (they run /guard off).";
