import type { ElementTable } from "claude-code";

// The dashboard pane's shared shapes: its id, the data and actions the drawing gets
// (`Parts`). The drawing (panel-tabs.tsx) is pure: no `$` (it never crosses an import), so
// every press goes through `Actions`, which panel-view.tsx builds.

export const PANE = "kit-panel";

// One usage figure: "ctx 266k", "session 70% · 1h18m"; pct colors it from 60% and 85%.
export type Usage = {
  label: string;
  value: string;
  note?: string;
  pct: number;
};
export type Tab = "chat" | "messages";
// One recent message of this chat, for the Messages tab: whose, and its text on one line.
export type Excerpt = { role: "you" | "claude"; text: string };
// The Chat tab: the run, the session's usage with the context by category, what it touched.
export type Chat = {
  model: string;
  effort: string | undefined;
  locked: boolean;
  turns: number;
  minutes: number;
  usd: number | undefined;
  context: { name: string; tokens: number }[];
  used: number;
  max: number;
  files: string[];
  agents: { type: string; n: number }[];
  compactions: number;
};
export type Actions = {
  tab: (tab: Tab) => void; // shows another tab of the pane
  remember: (text: string) => void; // asks the model to keep it as a lesson (kit:lessons)
};
export type Parts = {
  el: ElementTable;
  tab: Tab;
  chat: Chat | null;
  messages: Excerpt[] | null; // the Messages tab's recent messages, newest first
  rows: number; // the docked pane's body rows, so the pad sits at the bottom; 0 inline
  act: Actions;
};
