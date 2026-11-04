import { EXPLORE_LABELS } from "./explore-first";
import { CHANGE_LABELS } from "./flow-policy";
import { VERIFY_LABELS } from "./task-policy";

// A test's stand-in for the model behind flow's one labelling call: it answers only the
// questions the prompt asks, with the option keys given as labels (`CHANGE_LABELS.light`).
const key = (label: string) => label.split(":")[0] ?? "";

export function labelAnswer(
  prompt: unknown,
  v: { change?: string; verify?: string; explore?: boolean },
) {
  const p = String(prompt);
  const lines: string[] = [];
  if (p.includes(CHANGE_LABELS.none) && v.change)
    lines.push(`change: ${key(v.change)}`);
  if (p.includes(VERIFY_LABELS.cosmetic) && v.verify)
    lines.push(`verify: ${key(v.verify)}`);
  if (p.includes(EXPLORE_LABELS.explore))
    lines.push(`explore: ${v.explore ? "explore" : "direct"}`);
  return {
    value: {
      isAnswered: true as const,
      text: lines.join("\n"),
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  };
}
