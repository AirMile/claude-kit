import type { ElementTable } from "claude-code";

import type { SpecState } from "./spec";

// The roadmap pane's shared shapes: the data and actions every drawing file gets (`Parts`),
// colors and small helpers. The drawing is pure: no `$` (it never crosses an import), so
// every press goes through `Actions`, which roadmap-view.tsx builds. Files: dashboard (top),
// phase (a phase and its cards), card (one card and its ⋯ row), later (## Later).

export type State = "open" | "progress" | "done";
export type Card = {
  slug: string;
  description: string;
  state: State;
  phase: string;
  editable: boolean;
};
// One usage figure: "ctx 266k", "session 70% · 1h18m"; pct colors it from 60% and 85%.
export type Usage = {
  label: string;
  value: string;
  note?: string;
  pct: number;
};
export type Git = { changed: number; branch: string; unpushed: number | null };
export type Actions = {
  build: (slug: string) => void; // runs /clear, then /kit:build <slug> in the fresh chat
  run: (command: string, args?: string) => void; // runs the slash command at once
  edit: (done: string, change: (text: string) => string) => void;
  fold: (phase: string) => void;
  toggleAdd: (phase: string, folded: boolean) => void;
  add: (phase: string, title: string) => void;
  addLater: (idea: string) => void;
  menu: (key: string) => void; // open or close one ⋯ row (a slug, or later-<index>)
  // A press that can't be undone from the pane: the first arms it (its label asks), a second
  // press within a few seconds runs it.
  confirm: (key: string, run: () => void) => void;
};
export type Parts = {
  el: ElementTable;
  ui: ElementTable<"terminal" | "desktop"> | null; // Input lives only there
  menuOpen: string | null;
  confirming: string | null;
  product: string;
  cards: Card[];
  later: string[];
  draft: boolean;
  specs: Record<string, SpecState | null>;
  git: Git | null;
  isSetUp: boolean;
  hasDiff: boolean;
  gitError: string; // /diff exists here (the CLI's built-in diff mod)
  usage: Usage[];
  note: string;
  adding: string | null;
  added: number;
  toggled: Set<string>;
  act: Actions;
};

export const ICON: Record<State, string> = {
  done: "✓",
  progress: "●",
  open: "○",
};
export const COLOR: Record<State, string> = {
  done: "#22c55e",
  progress: "#f59e0b",
  open: "#94a3b8",
};
export const BAND = "#1e293b"; // section headings
export const LATER = "\u0000later"; // `adding` key for Later: never a phase name

export const doneOf = (cs: Card[]) =>
  cs.filter((c) => c.state === "done").length;
export const phaseNames = (p: Parts) => [
  ...new Set(p.cards.map((c) => c.phase)),
];
