import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
// The pane never opens on its own: only /panel and the band's button open it.
function world(on: On) {
  const opens: string[] = [];
  on("session.root", async () => ({ value: "/p/app" }));
  on("fs.exists", async () => ({ value: true }));
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

test("stays closed at session start and resume", async ($, on) => {
  const opens = world(on);
  await $.classic.SessionStart({ source: "startup" });
  await $.classic.SessionStart({ source: "resume" });
  expect(opens).toEqual([]);
});

test("/panel opens the dashboard by hand", async ($, on) => {
  const opens = world(on);
  const ran = await $.command.run({ command: "panel" });
  expect(opens).toEqual(["kit-panel"]);
  expect(ran.text).toBe("Dashboard opened.");
});
