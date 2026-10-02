import type { ElementTable, EngineInterface, On } from "claude-code";

import * as file from "./roadmap-file";
import { body } from "./roadmap-dashboard";
import { pressOnFocus, tracked } from "./roadmap-press";
import type { Card, Git, Usage } from "./roadmap-parts";
import * as wt from "./roadmap-worktree";
import { inRoot, parseSpec, type SpecState } from "./spec";

// The roadmap pane, opened by /product: a project dashboard. Live: reads docs/roadmap.md, the
// open features' specs and git state, and edits open items in place (roadmap-file.ts keeps
// every other line as is); its buttons run kit's skills in the chat. Draft: /product in plan
// mode passes items as data, read-only. Drawing: roadmap-dashboard.tsx + roadmap-parts.tsx; done and in-progress
// state stays /build's.

export const PANE = "kit-roadmap";
const PATH = "docs/roadmap.md";

export type Draft = { product: string; cards: Card[]; later: string[] };
let draft: Draft | null = null;
let product = "Roadmap"; // docs/product.md's name, read when the pane opens (roadmap-open.ts)
let live: file.Roadmap | null = null;
let specs: Record<string, SpecState | null> = {};
let away: Record<string, string> = {}; // open features running elsewhere (roadmap-worktree.ts)
let git: Git | null = null;
let isSetUp = true;
let hasDiff = false;
let gitError = ""; // why git state is missing, shown dim in the dashboard
let usage: Usage[] = []; // context and plan limits, from register.tsx
let needsLoad = true;
let note = "";
let added = 0;
let adding: string | null = null; // the phase whose "+ Add" field is open
let menuOpen: string | null = null; // the card or Later idea whose ⋯ row is open
let confirming: string | null = null; // an armed Clear or Remove, waiting for its 2nd press
let sent = 0; // when a button last ran a command: presses right after it are a double click
// Phases the user folded or unfolded against the default (a finished phase starts folded).
const toggled = new Set<string>();

// Called when /product opens the pane: a draft (plan mode), or null for the live roadmap.
export function roadmapOpened(next: Draft | null, name: string): void {
  [draft, product, needsLoad, note] = [next, name, true, ""];
  [specs, away] = [{}, {}]; // a draft's cards must not show the live pane's specs
}

// Called on every Write/Edit: a change to docs/roadmap.md or a spec reloads the live pane.
export function roadmapEdited(path: string): boolean {
  if (!/docs\/(roadmap\.md|specs\/[^/]+\.md)$/.test(path.replace(/\\/g, "/")))
    return false;
  return (needsLoad = true);
}

// Called after every turn (session.measure): it may have committed, built or launched.
export function roadmapStale(): void {
  needsLoad = true;
}

// Context and plan limits, as register.tsx measures them after each turn.
export function roadmapUsage(figures: Usage[]): void {
  usage = figures;
}

function cards(r: file.Roadmap): Card[] {
  return r.items.map((i) => ({
    slug: i.slug,
    description: i.description,
    state: i.done ? "done" : i.spec ? "progress" : "open",
    phase: i.phase,
    editable: file.isEditable(i),
  }));
}

// Read-only git facts for the dashboard: changed files, branch, commits not on the remote's
// default branch. Null outside a repo; `unpushed` null without a remote.
async function readGit($: EngineInterface): Promise<Git | null> {
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
  if (status === null) return null;
  gitError = "";
  const ahead = await out(["rev-list", "--count", "origin/HEAD..HEAD"]);
  gitError = ""; // no origin/HEAD is normal: no Launch row then
  return {
    changed: status ? status.split("\n").length : 0,
    branch: (await out(["symbolic-ref", "--short", "HEAD"])) ?? "detached",
    unpushed: ahead === null ? null : Number(ahead),
  };
}

// Open features sent to a worktree (a $.store mark per project) or claimed on another branch
// (a spec commit there), plus the live spec of a claim checked out in a worktree here. Ended
// marks are dropped. Best effort: a failing call shows nothing.
async function readAway($: EngineInterface, root: string, open: string[]) {
  const git = (args: string[]) =>
    $.process.run(["git", ...args], { cwd: root }).catch(() => null);
  const r = await git(wt.CLAIMS_GIT);
  const t = await git(wt.WORKTREES_GIT);
  const all = ((await $.store.get(wt.STORE_KEY).catch(() => null)) ??
    {}) as wt.Marks;
  const mine = all[root] ?? {};
  const claimed = r?.exitCode === 0 ? wt.claims(r.stdout) : {};
  const trees = t?.exitCode === 0 ? wt.worktrees(t.stdout) : {};
  const now = await $.clock.now();
  const { lines, specs: at, keep } = wt.away(open, claimed, mine, now, trees);
  if (Object.keys(keep).length !== Object.keys(mine).length) {
    const rest = { ...all, [root]: keep };
    if (!Object.keys(keep).length) delete rest[root];
    await $.store.set(wt.STORE_KEY, rest).catch(() => {});
  }
  const read: Record<string, SpecState | null> = {};
  for (const [slug, path] of Object.entries(at))
    read[slug] = parseSpec(await $.fs.read(path).catch(() => null));
  return { lines, specs: read };
}

export function roadmapView(on: On) {
  pressOnFocus(on);
  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e);
    if (needsLoad && !draft) {
      needsLoad = false;
      const root = await $.session.root();
      const text = await $.fs.read(inRoot(root, PATH)).catch(() => null);
      live = typeof text === "string" ? file.parse(text) : null;
      specs = {};
      for (const i of live?.items ?? [])
        if (i.spec && !i.done)
          specs[i.slug] = parseSpec(
            await $.fs.read(inRoot(root, i.spec)).catch(() => null),
          );
      git = await readGit($);
      const open = (live?.items ?? []).filter((i) => !i.done && !i.spec);
      const elsewhere = await readAway(
        $,
        root,
        open.map((i) => i.slug),
      );
      away = elsewhere.lines;
      Object.assign(specs, elsewhere.specs); // their /build step, from the worktree
      isSetUp = await $.fs.exists(inRoot(root, "AGENTS.md")).catch(() => true);
      hasDiff = (await $.command.list().catch(() => [])).some(
        (c) => c.name === "diff",
      );
    }
    const view =
      draft ?? (live && { product, cards: cards(live), later: live.later });
    if (!view)
      return (
        <el.Text dimColor>
          No docs/roadmap.md here: run /product to make one.
        </el.Text>
      );

    const redraw = (message?: string) => {
      if (message !== undefined) note = message;
      $.ui.invalidate("ui.render");
    };
    // Runs a slash command at once (a feature's button clears the chat first, as fresh-start.ts
    // does), outside the press: inside it, $.command.run waits on the turn. A press within 2s
    // of the last is a double click and dropped; not "until the run settles": /compact's run
    // may not settle, which held every button. Failing, the line goes in the prompt box.
    const run = async (command: string, args: string, fresh: boolean) => {
      const line = `/${command}${args ? ` ${args}` : ""}`;
      const now = await $.clock.now();
      if (now - sent < 2000) return;
      sent = now;
      $.clock.after(50, async () => {
        let cleared = !fresh;
        try {
          if (fresh) await $.command.run({ command: "clear" });
          cleared = true;
          await $.command.run(args ? { command, args } : { command });
        } catch (err) {
          // Not cleared: building on in this chat would defeat the point.
          if (cleared) await $.prompt.fill({ text: line });
          const todo = `${cleared ? "" : "/clear, then "}${line}`;
          $.ui.toast(`kit: run ${todo} yourself (${String(err)})`);
        }
      });
    };
    // Raises the desktop's worktree chip (ccd_session's spawn_task) for /kit:build <slug>,
    // marked first so the card asks "Again?" at once. Failing: the old mark comes back.
    const toWorktree = async (slug: string) => {
      const now = await $.clock.now();
      if (now - sent < 2000) return;
      sent = now;
      const root = await $.session.root();
      const all = ((await $.store.get(wt.STORE_KEY).catch(() => null)) ??
        {}) as wt.Marks;
      const mine = { ...all[root] };
      const before = mine[slug];
      const mark = { ...all, [root]: { ...mine, [slug]: now } };
      await $.store.set(wt.STORE_KEY, mark).catch(() => {});
      away = { ...away, [slug]: away[slug] ?? "sent to worktree" };
      redraw();
      const why = await $.mcp
        .call("ccd_session", "spawn_task", wt.chip(slug))
        .then(wt.failure, (err) => String(err));
      if (why !== null) {
        if (before === undefined) delete mine[slug];
        const back = { ...all, [root]: mine };
        await $.store.set(wt.STORE_KEY, back).catch(() => {});
        $.ui.toast(`kit: worktree chip failed (${why})`);
      }
      needsLoad = true;
      redraw();
    };
    const edit = async (done: string, change: (text: string) => string) => {
      const path = inRoot(await $.session.root(), PATH);
      const text = String(await $.fs.read(path).catch(() => ""));
      try {
        const next = change(text);
        if (next !== text) await $.fs.write(path, next);
        note = next === text ? "nothing to change" : done;
      } catch (err) {
        note = err instanceof Error ? err.message : String(err);
      }
      needsLoad = true;
      menuOpen = null;
      redraw();
    };

    return body({
      el: tracked(el, e.surface),
      // Input and Select: terminal and desktop only.
      ui:
        e.surface === "terminal" || e.surface === "desktop"
          ? (el as ElementTable<"terminal" | "desktop">)
          : null,
      ...view,
      draft: !!draft,
      specs,
      away,
      canWorktree: e.surface === "desktop",
      git,
      isSetUp,
      hasDiff,
      gitError,
      usage,
      note,
      adding,
      added,
      menuOpen,
      confirming,
      toggled,
      act: {
        build: (slug) => void run("kit:build", slug, true),
        worktree: (slug) => void toWorktree(slug),
        run: (command, args = "") => void run(command, args, false),
        edit: (done, change) => void edit(done, change),
        fold: (phase) => {
          if (!toggled.delete(phase)) toggled.add(phase);
          redraw();
        },
        toggleAdd: (phase, folded) => {
          adding = adding === phase ? null : phase;
          // Unfold the phase so the new card shows up where it lands.
          if (adding && folded && !toggled.delete(phase)) toggled.add(phase);
          redraw();
        },
        confirm: (key, run) => {
          if (confirming === key) {
            confirming = null;
            run();
            return;
          }
          confirming = key;
          redraw();
          $.clock.after(4000, () => {
            if (confirming !== key) return;
            confirming = null;
            redraw();
          });
        },
        menu: (key) => {
          menuOpen = menuOpen === key ? null : key;
          redraw();
        },
        addLater: (idea) => {
          added += 1;
          adding = null;
          void edit("added to Later", (t) => file.addLater(t, idea));
        },
        add: (phase, title) => {
          added += 1; // a new key draws a fresh, empty field
          adding = null;
          void edit(`added to ${phase}`, (t) => file.add(t, phase, title));
        },
      },
    });
  });
}
