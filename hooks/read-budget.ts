import { checkOf } from "./flow-check";

// Only reads count; a shell command mixing reads with checks or edits does not.
export function isExplore(tool: string, command = ""): boolean {
  if (["Read", "Grep", "Glob"].includes(tool)) return true;
  if (tool !== "Bash" || checkOf(command)) return false;
  const parts = command
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    parts.length > 0 &&
    parts.every(
      (s) =>
        /^(?:(?:cat|head|tail|grep|rg|find|ls|wc)\b|sed\s+-n\b|git\s+(?:show|log|diff|status|grep)\b)/.test(
          s,
        ) &&
        !/[<>`]|\$\(/.test(s) &&
        !/\bsed\s+.*\s-i\b/.test(s),
    )
  );
}

export type ReadBudget = { calls: number; chars: number; noted: boolean };

export const readBudget = (): ReadBudget => ({
  calls: 0,
  chars: 0,
  noted: false,
});

export function countRead(
  state: ReadBudget,
  chars: number,
  leaning: boolean,
): string | undefined {
  state.calls++;
  state.chars += chars;
  if (
    state.noted ||
    (state.calls < (leaning ? 4 : 5) && state.chars < (leaning ? 10000 : 15000))
  )
    return undefined;
  state.noted = true;
  return `kit: this turn read ${state.calls} times (${state.chars} characters) itself. Hand the rest of the exploring to mcp__kit__delegate as one brief (role search or research); keep the decision here.`;
}
