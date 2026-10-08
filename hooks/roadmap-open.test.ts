import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
// The pane opens on its own in a kit project: at session start, else at the first prompt.
function world(on: On, files: string[], placed: boolean) {
  const opens: string[] = [];
  on("session.root", async () => ({ value: "/p/app" }));
  on("fs.exists", async (_$, e) => ({ value: files.includes(e.path) }));
  on("fs.read", async () => {
    throw new Error("ENOENT");
  });
  on("ui.open", async (_$, e) => {
    opens.push(e.id);
    return {
      value: placed
        ? { isPlaced: true as const }
        : { isPlaced: false as const, reason: "narrow" },
    };
  });
  on("ui.invalidate", async () => ({ value: undefined }));
  on("classic.SessionStart", async () => ({ value: {} }));
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  return opens;
}
const start = (
  $: Parameters<Parameters<typeof test>[1]>[0],
  source: "startup" | "resume" | "clear" | "compact" = "startup",
) => $.classic.SessionStart({ source });
const ROADMAP = ["/p/app/docs/roadmap.md"];

test("opens at session start in a project with a roadmap", async ($, on) => {
  const opens = world(on, ROADMAP, true);
  await start($);
  expect(opens).toEqual(["kit-roadmap"]);
  await $.prompt.submit({ text: "hi" });
  expect(opens).toEqual(["kit-roadmap"]); // seated: the prompt does not reopen it
});

test("stays closed without a roadmap, and after a /clear", async ($, on) => {
  const opens = world(on, [], true);
  await start($);
  await start($, "clear");
  await $.prompt.submit({ text: "hi" });
  expect(opens).toEqual([]);
});

test("a pane that waited undrawn is opened again by the first prompt only", async ($, on) => {
  const opens = world(on, ROADMAP, false);
  await start($);
  expect(opens).toEqual(["kit-roadmap"]);
  await $.prompt.submit({ text: "one" });
  await $.prompt.submit({ text: "two" });
  expect(opens).toEqual(["kit-roadmap", "kit-roadmap"]);
});
