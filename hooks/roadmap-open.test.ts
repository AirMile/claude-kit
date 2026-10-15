import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
// The pane never opens on its own: only /panel, the band's button or /product's tool open it.
function world(on: On, files: string[]) {
  const opens: string[] = [];
  on("session.root", async () => ({ value: "/p/app" }));
  on("fs.exists", async (_$, e) => ({ value: files.includes(e.path) }));
  on("fs.read", async () => {
    throw new Error("ENOENT");
  });
  on("ui.open", async (_$, e) => {
    opens.push(e.id);
    return { value: { isPlaced: true as const } };
  });
  on("ui.invalidate", async () => ({ value: undefined }));
  on("classic.SessionStart", async () => ({ value: {} }));
  return opens;
}
const ROADMAP = ["/p/app/docs/roadmap.md"];

test("stays closed at session start, also in a project with a roadmap", async ($, on) => {
  const opens = world(on, ROADMAP);
  await $.classic.SessionStart({ source: "startup" });
  await $.classic.SessionStart({ source: "resume" });
  expect(opens).toEqual([]);
});

test("/panel opens the pane by hand, also without a roadmap", async ($, on) => {
  const opens = world(on, []);
  const ran = await $.command.run({ command: "panel" });
  expect(opens).toEqual(["kit-roadmap"]);
  expect(ran.text).toBe("Roadmap pane opened.");
});
