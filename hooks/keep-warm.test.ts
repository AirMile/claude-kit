import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

// kit's own mod is loaded around the test; these hooks only answer what is beneath it.
function world(on: On) {
  const timers: number[] = [];
  on("clock.now", async () => ({ value: Date.parse("2026-10-16T12:00:00Z") }));
  on("clock.every", (_$, e) => {
    timers.push(e.ms);
    return new Promise<never>(() => {}); // never fires here
  });
  on("ui.invalidate", async () => ({ value: undefined }));
}
const run = (command: string, args = "") => ({ command, args }) as never;

test("/warm toggles keep warm, and on/off set it", async ($, on) => {
  world(on);
  expect((await $.command.run(run("warm"))).text).toContain("Keep warm on");
  expect((await $.command.run(run("warm"))).text).toBe("Keep warm off.");
  expect((await $.command.run(run("warm", "on"))).text).toContain("Keep warm on");
  expect((await $.command.run(run("warm", "on"))).text).toContain("Keep warm on");
  expect((await $.command.run(run("warm", "off"))).text).toBe("Keep warm off.");
});

test("/band draws the band again and says how to unfold it", async ($, on) => {
  world(on);
  expect((await $.command.run(run("band"))).text).toContain("ctrl+x ctrl+a");
});
