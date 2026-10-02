// Parses one spec's state; the only kit file the mod reads (see AGENTS.md § Budgets).
// Pure functions: the engine only follows `$` within one file, so callers do the reading.

export type SpecState = { status: string; done: number; total: number };

export function parseSpec(text: unknown): SpecState | null {
  if (typeof text !== "string") return null;
  const criteria =
    text.split(/^## /m).find((s) => s.startsWith("Acceptance criteria")) ?? "";
  const done = criteria.match(/^- \[x\]/gim)?.length ?? 0;
  const open = criteria.match(/^- \[ \]/gm)?.length ?? 0;
  const status = /^Status:\s*(\S+)/m.exec(text)?.[1] ?? "?";
  return { status, done, total: done + open };
}

// `git symbolic-ref --short HEAD` output → the feat/ or fix/ slug, or null.
export function branchSlug(head: string | undefined): string | null {
  return /^(?:feat|fix)\/(.+)$/.exec(head?.trim() ?? "")?.[1] ?? null;
}

// A project path against the session's root ($.session.root()), not the shell's cwd: a `cd`
// during the session must not hide docs/ or AGENTS.md. Absolute paths pass through.
export function inRoot(root: string, path: string): string {
  if (/^(\/|[a-zA-Z]:[\\/])/.test(path)) return path;
  return `${root.replace(/[\\/]+$/, "")}/${path}`;
}
