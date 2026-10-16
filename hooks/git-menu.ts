import type { EngineInterface } from "claude-code";

// The band's Git menu: each item is a prompt sent as the person's own, just after the press
// (inside it a send can be refused). The model runs the git; push-guard still asks before a
// push, so a click on Push is a request, not a bypass. Branch needs a name: it fills the
// prompt box for the person to finish.

export const GIT_ITEMS = ["Diff", "Pull", "Push", "PR", "Branch"] as const;
export type GitItem = (typeof GIT_ITEMS)[number];

const PROMPTS: Record<Exclude<GitItem, "Branch">, string> = {
  Push: "Push the current branch to origin.",
  Pull: "Pull the latest changes for the current branch from origin (fast-forward or rebase, no merge commit), and tell me what came in.",
  PR: "Open a pull request for the current branch against the default branch, with a short title and a description of the changes.",
  Diff: "Show git status and a short summary of the uncommitted changes, file by file.",
};

let sent = 0; // when an item was last pressed: a press within 2s is a double click

export async function gitAction($: EngineInterface, item: GitItem) {
  const now = await $.clock.now();
  if (now - sent < 2000) return;
  sent = now;
  $.clock.after(50, async () => {
    if (item === "Branch") {
      await $.prompt
        .fill({ text: "Create a new branch for: " })
        .catch(() => {});
      return;
    }
    await $.prompt
      .submit({ text: PROMPTS[item], asUser: true })
      .catch((err) =>
        $.ui.toast(`kit: could not send ${item} (${String(err)})`),
      );
  });
}
