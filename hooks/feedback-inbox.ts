import type { EngineInterface, On, ToolSpec } from "claude-code";

import * as fb from "./feedback";
import { inRoot } from "./spec";

// The feedback inbox: the tool the Skill Feedback rule calls after a kit skill run (any
// project) and /improve reads in the kit repo, plus the status line there while points wait.

const TOOL = "mcp__kit__feedback";

export const feedbackTool: ToolSpec = {
  name: "feedback",
  description:
    "kit's Skill Feedback inbox, shared by every project on this machine. add: record one " +
    "friction point about a kit skill (skill = build, commit, …; text = one line). list: " +
    "open points, oldest first (optional skill). done: close points by id after /improve " +
    "acted on or declined them.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["add", "list", "done"] },
      skill: { type: "string" },
      text: { type: "string" },
      ids: { type: "array", items: { type: "string" } },
    },
    required: ["action"],
  },
};

async function readAll($: EngineInterface): Promise<Record<string, fb.Point>> {
  const keys = (await $.store.keys()).filter((k) => k.startsWith(fb.PREFIX));
  const points: Record<string, fb.Point> = {};
  for (const key of keys) {
    const p = (await $.store.get(key)) as fb.Point | undefined;
    if (p && typeof p.skill === "string" && typeof p.text === "string")
      points[key.slice(fb.PREFIX.length)] = p;
  }
  return points;
}

async function isKitCheckout($: EngineInterface): Promise<boolean> {
  const root = await $.session.root();
  const manifest = await $.fs
    .read(inRoot(root, ".claude-plugin/plugin.json"))
    .catch(() => null);
  try {
    return JSON.parse(String(manifest)).name === "kit";
  } catch {
    return false;
  }
}

// The line under the prompt: open points in a kit checkout, cleared everywhere else.
async function inboxStatus(
  $: EngineInterface,
  points?: Record<string, fb.Point>,
) {
  const text = (await isKitCheckout($))
    ? fb.statusText(points ?? (await readAll($).catch(() => ({}))))
    : undefined;
  $.ui.status(text);
}

async function answer($: EngineInterface, req: fb.Request): Promise<string> {
  const points = await readAll($);
  let reply: string;
  if (req.action === "add") {
    const dup = fb.duplicate(points, req.skill, req.text);
    if (dup) return `Already open as #${dup} · ${req.skill}`;
    const at = await $.clock.now();
    let id = fb.newId(at, Math.random());
    while (id in points) id = fb.newId(at, Math.random());
    const point: fb.Point = {
      skill: req.skill,
      text: req.text,
      project: await $.session.root(),
      at,
    };
    await $.store.set(fb.PREFIX + id, point);
    points[id] = point;
    const open = Object.values(points).filter((p) => p.skill === req.skill);
    reply = `Recorded #${id} · ${req.skill}: ${open.length} open`;
  } else if (req.action === "list") {
    return fb.lines(points, req.skill);
  } else {
    const known = req.ids.filter((id) => id in points);
    const unknown = req.ids.filter((id) => !(id in points));
    for (const id of known) {
      await $.store.delete(fb.PREFIX + id);
      delete points[id];
    }
    reply =
      `Closed ${known.length}` +
      (unknown.length
        ? ` · unknown: ${unknown.map((id) => `#${id}`).join(", ")}`
        : "");
  }
  // The write is done: a failing status refresh must not report it as failed.
  await inboxStatus($, points).catch(() => {});
  return reply;
}

export function feedbackInbox(on: On) {
  // Open points in a kit checkout; elsewhere this clears the line older versions drew.
  // (classic.SessionStart: register.tsx owns session.start; this one also fires after /clear.)
  on("classic.SessionStart", async ($, e, next) => {
    const started = await next(e);
    await inboxStatus($).catch(() => $.ui.status(undefined));
    return started;
  });

  on("tool.check", { tool: TOOL }, () => ({ decision: "allow" }));

  on("tool.call", { tool: TOOL }, async ($, e) => {
    const req = fb.validate(e as unknown as Record<string, unknown>);
    if (typeof req === "string") return { result: req };
    try {
      return { result: await answer($, req) };
    } catch (err) {
      return { result: `kit: inbox unavailable (${String(err)})` };
    }
  });
}
