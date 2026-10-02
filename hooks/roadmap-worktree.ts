// The roadmap pane's "build in a worktree" (desktop app): which open features already run
// elsewhere, and the chip that starts one. Pure, like spec.ts: roadmap-view.tsx makes the
// calls (git, $.store, the desktop's ccd_session spawn_task) and passes their results in.

export const STORE_KEY = "worktree"; // $.store: { [project root]: { [slug]: sentAt ms } }
export const SENT_TTL = 60 * 60 * 1000; // a chip not started within this counts as dismissed
export type Marks = Record<string, Record<string, number>>;

// Commits on other branches (not reachable from HEAD) that touch a spec, each led by the ref
// that reached it. /build commits a spec first: that commit is its claim on the slug.
export const CLAIMS_GIT = [
  "log",
  "--all",
  "--not",
  "HEAD",
  "--source",
  "--name-only",
  "--format=%S",
  "--",
  "docs/specs",
];

// This repo's worktrees; `worktrees` reads the output.
export const WORKTREES_GIT = ["worktree", "list", "--porcelain"];

// WORKTREES_GIT's output → { branch: worktree path }; a detached worktree has no branch.
export function worktrees(out: string): Record<string, string> {
  const found: Record<string, string> = {};
  let path = "";
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) path = line.slice(9);
    const branch = /^branch refs\/heads\/(.+)$/.exec(line)?.[1];
    if (branch && path) found[branch] = path;
  }
  return found;
}

// CLAIMS_GIT's output → { slug: branch } (newest commit first, so its ref wins). Remote
// branches keep their remote (`origin/feat/x`); tags, stash and `<remote>/HEAD` claim nothing.
export function claims(out: string): Record<string, string> {
  const found: Record<string, string> = {};
  let ref = "";
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("refs/")) {
      const name = /^refs\/(?:heads|remotes)\/(.+)$/.exec(line)?.[1] ?? "";
      ref = name.endsWith("/HEAD") ? "" : name;
      continue;
    }
    const slug = /^docs\/specs\/([^/]+)\.md$/.exec(line)?.[1];
    if (slug && ref && !(slug in found)) found[slug] = ref;
  }
  return found;
}

// The dim line under each open card that runs elsewhere, the spec to read for a claim checked
// out in a worktree here (its /build step, live), and the marks still worth keeping: a claim
// wins over a mark (and ends it), an expired mark is dropped.
export function away(
  open: string[],
  claimed: Record<string, string>,
  sent: Record<string, number>,
  now: number,
  trees: Record<string, string> = {},
): {
  lines: Record<string, string>;
  specs: Record<string, string>;
  keep: Record<string, number>;
} {
  const lines: Record<string, string> = {};
  const specs: Record<string, string> = {};
  const keep: Record<string, number> = {};
  for (const slug of open) {
    const at = sent[slug];
    const branch = claimed[slug];
    const tree = branch ? trees[branch] : undefined;
    if (tree) specs[slug] = `${tree}/docs/specs/${slug}.md`;
    if (branch) lines[slug] = `runs on ${branch}`;
    else if (at !== undefined && now - at < SENT_TTL) {
      lines[slug] = "sent to worktree";
      keep[slug] = at;
    }
  }
  return { lines, specs, keep };
}

// spawn_task's arguments: a chip that, clicked, starts /kit:build <slug> in a new worktree.
export const chip = (slug: string) => ({
  title: `Build ${slug}`,
  tldr: `Started from the roadmap pane: builds ${slug} in its own worktree with /kit:build.`,
  prompt: `/kit:build ${slug}`,
});

// An MCP result → why it failed, or null when it raised the chip.
export function failure(r: {
  isError: boolean;
  content: readonly { type: string; text?: string }[];
}): string | null {
  if (!r.isError) return null;
  const text = r.content
    .map((c) => c.text ?? "")
    .join(" ")
    .trim();
  return text || "spawn_task refused";
}
