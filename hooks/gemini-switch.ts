import type { EngineInterface } from "claude-code";

// The Gemini switch (on unless turned off, kept across chats; the rings' table and /gemini):
// on, Gemini takes a review or second plan GPT cannot, a review of GPT's code and its share by
// the plans' balance (delegate.ts, family-turn.ts) and its ring is drawn; off, it runs only when
// asked for and only the rings' table shows its meters (a /usage read, no model run). Read from the store each time,
// so a switch flipped in another chat holds here too; a read that fails counts as off, since on
// sends code to Google.

const KEY = "gemini";

export async function geminiOn($: EngineInterface): Promise<boolean> {
  return $.store.get(KEY).then(
    (v) => v !== false,
    () => false,
  );
}

// False when the switch could not be saved: the old position holds.
export async function setGeminiOn($: EngineInterface, next: boolean) {
  return $.store.set(KEY, next).then(
    () => true,
    () => false,
  );
}
