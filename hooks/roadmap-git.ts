import type { EngineInterface } from "claude-code";

import type { Git } from "./roadmap-parts";

// Read-only git facts for the pane: changed files, branch, commits not on the remote's default
// branch. Null outside a repo, with why; `unpushed` null without a remote.
export async function readGit(
  $: EngineInterface,
): Promise<{ git: Git | null; error: string }> {
  let gitError = "";
  const root = await $.session.root();
  let cwd: string | undefined = root;
  const out = async (args: string[]) => {
    const r = await $.process
      .run(["git", ...args], cwd ? { cwd } : undefined)
      .catch((err) => ({ exitCode: -1, stdout: "", stderr: String(err) }));
    if (r.exitCode !== 0) gitError = r.stderr.trim().split("\n")[0] ?? "";
    return r.exitCode === 0 ? r.stdout.trim() : null;
  };
  gitError = "";
  let status = await out(["status", "--porcelain"]);
  if (status === null) {
    cwd = undefined; // the shell's cwd: still inside the repo after a `cd` within it
    status = await out(["status", "--porcelain"]);
  }
  if (status === null) return { git: null, error: gitError };
  gitError = "";
  const ahead = await out(["rev-list", "--count", "origin/HEAD..HEAD"]);
  gitError = ""; // no origin/HEAD is normal: no Launch row then
  const log =
    ahead && Number(ahead)
      ? await out(["log", "--oneline", "-20", "origin/HEAD..HEAD"])
      : null;
  gitError = "";
  const files = status ? status.split("\n") : [];
  const git: Git = {
    changed: files.length,
    branch: (await out(["symbolic-ref", "--short", "HEAD"])) ?? "detached",
    unpushed: ahead === null ? null : Number(ahead),
    files,
    commits: log ? log.split("\n") : [],
  };
  return { git, error: gitError };
}
