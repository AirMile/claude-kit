import type { On, ToolSpec } from "claude-code";

// /build's safe point, automated: the model calls fresh_start after the user picked
// "Fresh start"; when that turn ends, the chat clears and /kit:build <slug> resumes from the
// spec in the fresh one. Same chain as the roadmap pane's Pick up, but run from turn.complete.

const TOOL = "mcp__kit__fresh_start";
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

let armed: string | null = null;

export const freshTool: ToolSpec = {
  name: "fresh_start",
  description:
    "kit /build safe point: after this turn ends, clear the chat and run /kit:build <slug> " +
    "in the fresh one. Call it only after the user chose Fresh start, then end the turn.",
  inputSchema: {
    type: "object",
    properties: { slug: { type: "string" } },
    required: ["slug"],
  },
};

export function freshStart(on: On) {
  on("tool.check", { tool: TOOL }, () => ({ decision: "allow" }));

  on("tool.call", { tool: TOOL }, async (_$, e) => {
    const slug = String((e as unknown as { slug?: unknown }).slug ?? "");
    if (!SLUG.test(slug))
      return { result: `Not armed: invalid slug "${slug}".` };
    armed = slug;
    return {
      result: `Armed: when this turn ends, the chat clears and /kit:build ${slug} starts. End the turn now.`,
    };
  });

  on("turn.complete", async ($, e, next) => {
    const done = await next(e);
    if (!armed || e.agentId) return done;
    const slug = armed;
    armed = null;
    if (e.reason !== "answer") {
      $.ui.toast(`kit: fresh start for ${slug} cancelled`);
      return done;
    }
    // Outside the hook: $.command.run rejects inside a hook the turn waits on.
    $.clock.after(300, async () => {
      try {
        await $.command.run({ command: "clear" });
      } catch (err) {
        // Building on in this same chat would defeat the point: leave it to the user.
        $.ui.toast(
          `kit: could not clear (${String(err)}). Run /clear, then /build ${slug}`,
        );
        return;
      }
      await $.command
        .run({ command: "kit:build", args: slug })
        .catch((err) =>
          $.ui.toast(`kit: could not start /build ${slug}: ${String(err)}`),
        );
    });
    return done;
  });
}
