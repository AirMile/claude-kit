import type { EngineInterface } from "claude-code";

import { geminiCached, readGemini } from "./agy-usage";
import { gptCurrent, gptOn } from "./codex-run";
import { geminiStandsIn } from "./delegate-gemini";
import { type Author, OTHER_FAMILY, type Role } from "./delegate-policy";
import { balancePick, type Side } from "./family-balance";
import { flowGateLevel, flowGeminiWrote } from "./flow";

// Whether Gemini takes an unasked review or second plan before GPT is asked (delegate.ts), and
// why: a review of GPT's code (another family than GPT, in place of a Claude reviewer), or the
// balance of both plans (family-balance.ts) while both switches are on. A switch that is off
// keeps its family out; a V3 review stays on GPT (Astra). The last pick is kept in $.store so
// close meters take turns across chats.

const KEY = "familyTurn";

export type TurnInput = {
  role: Role;
  author?: Author;
  asked?: boolean; // GPT picked by name
  family?: string; // a GPT family named
  thread?: string;
};

export async function geminiTurn(
  $: EngineInterface,
  i: TurnInput,
): Promise<string | undefined> {
  if (!OTHER_FAMILY.includes(i.role) || i.asked || i.family || i.thread)
    return undefined;
  if (i.author === "gemini") return undefined;
  if (i.role === "review" && (await flowGeminiWrote($))) return undefined;
  if (!(await geminiStandsIn($, i.role))) return undefined;
  if (i.role === "review" && i.author === "gpt")
    return "GPT wrote this code: Gemini reviews it as another family";
  if (!(await gptOn($))) return undefined; // GPT off: the stand-in takes it
  if (i.role === "review" && (await flowGateLevel($).catch(() => 0)) >= 3)
    return undefined;
  const st = await gptCurrent($);
  const gpt = st.argv && !st.error ? st.limits : undefined;
  // A reading in hand is used as it is (refreshed in the background); only the first waits.
  if (geminiCached()) void readGemini($).catch(() => false);
  else await readGemini($).catch(() => false);
  const kept = await $.store.get(KEY).catch(() => undefined);
  const last: Side | undefined =
    kept === "gpt" || kept === "gemini" ? kept : undefined;
  const side = balancePick(gpt, geminiCached(), last);
  await $.store.set(KEY, side).catch(() => {});
  return side === "gemini"
    ? "kit spreads reviews and plans over ChatGPT and Gemini by whose plan is used less"
    : undefined;
}
