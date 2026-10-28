import type { Change } from "./flow-policy";
import type { Kind } from "./model-policy";

// The second prompt classifier asks only whether fresh reading is needed.
export const EXPLORE_LABELS = {
  explore:
    "explore: answering or doing this needs reading or searching code or docs that are not already in this chat",
  direct: "direct: a small change or answer where the place is known",
};

const NOTE =
  "kit: start by handing the exploring to mcp__kit__delegate as one brief (role research to read and weigh, search to locate code); read only the file:line it points to, then decide and act here.";

export function exploreNote(i: {
  label: string | undefined;
  ready: boolean;
  build: boolean;
  thin: boolean;
  kind: Kind;
  change: Change | undefined;
}): string | undefined {
  return i.ready &&
    !i.build &&
    !i.thin &&
    (i.kind === "question" ||
      (i.change !== undefined && i.change !== "none")) &&
    i.label === EXPLORE_LABELS.explore
    ? NOTE
    : undefined;
}
