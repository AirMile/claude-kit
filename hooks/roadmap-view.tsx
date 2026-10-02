import type { ElementTable, EngineInterface, On, ToolSpec } from "claude-code";

import * as file from "./roadmap-file";
import { body } from "./roadmap-dashboard";
import { pressOnFocus, tracked } from "./roadmap-press";
import type { Card, Git, Usage } from "./roadmap-parts";
import { inRoot, parseSpec, type SpecState } from "./spec";
import { list } from "./theme-view";

// The roadmap pane, opened by /roadmap: a project dashboard. Live: reads docs/roadmap.md, the
// open features' specs and git state, and edits open items in place (roadmap-file.ts keeps
// every other line as is); its buttons run kit's skills in the chat. Draft: /roadmap in plan
// mode passes items as data, read-only. Drawing: roadmap-dashboard.tsx + roadmap-parts.tsx; done and in-progress
// state stays /build's.

const PANE = "kit-roadmap";
const PATH = "docs/roadmap.md";

let draft: { product: string; cards: Card[]; later: string[] } | null = null;
let live: { product: string; roadmap: file.Roadmap } | null = null;
let specs: Record<string, SpecState | null> = {};
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

export const roadmapTool: ToolSpec = {
  name: "roadmap_view",
  description:
    "Open kit's roadmap pane. No items → it shows docs/roadmap.md live and editable. With " +
    "items → a read-only draft (plan mode): items in order, ## Later excluded; state open, " +
    "progress (spec linked, unchecked) or done; phase = the item's heading without '## '.",
  inputSchema: {
    type: "object",
    properties: {
      product: { type: "string" },
      items: list({
        slug: "string",
        description: "string",
        state: "string",
        phase: "string",
      }),
      later: { type: "array", items: { type: "string" } },
    },
  },
};

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

// docs/product.md's `# <name>`, or "Roadmap" without one.
async function productName($: EngineInterface): Promise<string> {
  const root = await $.session.root();
  const text = await $.fs.read(inRoot(root, "docs/product.md")).catch(() => "");
  return /^# (.+)$/m.exec(String(text))?.[1]?.trim() || "Roadmap";
}

export function roadmapView(on: On) {
  pressOnFocus(on);
  on("tool.check", { tool: "mcp__kit__roadmap_view" }, () => ({
    decision: "allow",
  }));

  on("tool.call", { tool: "mcp__kit__roadmap_view" }, async ($, e) => {
    const input = e as unknown as {
      product?: string;
      items?: Card[];
      later?: string[];
    };
    draft = Array.isArray(input.items)
      ? {
          product: input.product ?? "Roadmap",
          cards: input.items.map((i) => ({
            ...i,
            phase: i.phase ?? "",
            editable: false,
          })),
          later: input.later ?? [],
        }
      : null;
    [needsLoad, note] = [true, ""];
    // The pane is titled with the project's name (an open pane is retitled).
    const name = draft ? `${draft.product} · draft` : await productName($);
    const opened = await $.ui.open({ id: PANE, title: name });
    $.ui.invalidate("ui.render");
    return {
      result: opened.isPlaced
        ? "Roadmap pane shown."
        : `Roadmap pane not shown (${opened.reason}).`,
    };
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e);
    if (needsLoad && !draft) {
      needsLoad = false;
      const root = await $.session.root();
      const text = await $.fs.read(inRoot(root, PATH)).catch(() => null);
      const product = await productName($);
      live =
        typeof text === "string"
          ? {
              roadmap: file.parse(text),
              product,
            }
          : null;
      specs = {};
      for (const i of live?.roadmap.items ?? [])
        if (i.spec && !i.done)
          specs[i.slug] = parseSpec(
            await $.fs.read(inRoot(root, i.spec)).catch(() => null),
          );
      git = await readGit($);
      isSetUp = await $.fs.exists(inRoot(root, "AGENTS.md")).catch(() => true);
      hasDiff = (await $.command.list().catch(() => [])).some(
        (c) => c.name === "diff",
      );
    }
    const view =
      draft ??
      (live && {
        product: live.product,
        cards: cards(live.roadmap),
        later: live.roadmap.later,
      });
    if (!view)
      return (
        <el.Text dimColor>
          No docs/roadmap.md here: run /roadmap to make one.
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
