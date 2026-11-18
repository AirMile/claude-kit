import { expect, test } from "claude-code/testing";

import { world } from "./flow-fixture";

const AGENTS =
  "## Commands\n\n- Test: `npm test`\n- Protected: biome.json, e2e/**\n";

function setup(on: Parameters<typeof world>[0], agents = AGENTS) {
  const file = { agents };
  world(on);
  on("fs.read", async (_$, e) => {
    if (!e.path.endsWith("/AGENTS.md")) throw new Error("missing");
    return { value: file.agents };
  });
  return file;
}
const edit = ($: never, path: string, tool = "Edit") =>
  ($ as { tool: { call: (i: never) => Promise<{ deny?: string }> } }).tool.call({
    tool,
    file_path: path,
    old_string: "a",
    new_string: "b",
    content: "x",
  } as never);
const run = ($: never, args: string) =>
  ($ as {
    command: { run: (i: never) => Promise<{ text?: string }> };
  }).command.run({ command: "guard", args } as never);
const bash = ($: never, command: string) =>
  ($ as { tool: { call: (i: never) => Promise<{ deny?: string }> } }).tool.call({
    tool: "Bash",
    command,
  } as never);

test("nothing is denied until the user locks the project", async ($, on) => {
  setup(on);
  expect((await edit($ as never, "/p/app/biome.json")).deny).toBeUndefined();
  expect(String((await run($ as never, "status")).text)).toContain("unlocked");
});

test("locked: edits and writes to protected files are denied, other files are not", async ($, on) => {
  setup(on);
  expect(String((await run($ as never, "on")).text)).toContain("locked");
  for (const tool of ["Edit", "Write", "MultiEdit"])
    expect((await edit($ as never, "/p/app/biome.json", tool)).deny).toContain(
      "kit guard",
    );
  expect((await edit($ as never, "/p/app/e2e/a/login.spec.ts")).deny).toContain(
    "the user decides",
  );
  expect((await edit($ as never, "/p/app/src/a.ts")).deny).toBeUndefined();
});

test("locked: a shell write to a protected file is denied, a read is not", async ($, on) => {
  setup(on);
  await run($ as never, "on");
  expect((await bash($ as never, "sed -i '' 's/a/b/' biome.json")).deny).toContain(
    "kit guard",
  );
  expect((await bash($ as never, "cat biome.json")).deny).toBeUndefined();
});

test("/guard on needs Protected globs; /guard off unlocks", async ($, on) => {
  const file = setup(on, "## Commands\n\n- Test: `npm test`\n");
  expect(String((await run($ as never, "on")).text)).toContain("Protected:");
  expect((await edit($ as never, "/p/app/biome.json")).deny).toBeUndefined();
  file.agents = AGENTS;
  await run($ as never, "on");
  expect((await edit($ as never, "/p/app/biome.json")).deny).toBeDefined();
  await run($ as never, "off");
  expect((await edit($ as never, "/p/app/biome.json")).deny).toBeUndefined();
});

test("the globs are kept as they were when locked: editing AGENTS.md does not unlock", async ($, on) => {
  const file = setup(on);
  await run($ as never, "on");
  file.agents = "## Commands\n\n- Test: `npm test`\n";
  expect((await edit($ as never, "/p/app/biome.json")).deny).toBeDefined();
  expect(String((await run($ as never, "status")).text)).toContain("biome.json");
});

test("a path with .. segments is still caught, and a worktree below the root is locked too", async ($, on) => {
  setup(on);
  await run($ as never, "on");
  expect((await edit($ as never, "/p/app/src/../biome.json")).deny).toBeDefined();
});

test("NotebookEdit and PowerShell calls are guarded, and an agentId changes nothing (the hook has no caller filter)", async ($, on) => {
  setup(on);
  await run($ as never, "on");
  const call = (input: object) =>
    ($ as never as {
      tool: { call: (i: never) => Promise<{ deny?: string }> };
    }).tool.call(input as never);
  expect(
    (await call({ tool: "Edit", file_path: "/p/app/biome.json", old_string: "a", new_string: "b", agentId: "sub1" })).deny,
  ).toContain("kit guard");
  expect(
    (await call({ tool: "NotebookEdit", notebook_path: "/p/app/e2e/n.ipynb", new_source: "x" })).deny,
  ).toContain("kit guard");
  expect(
    (await call({ tool: "PowerShell", command: "Set-Content -Path biome.json -Value x" })).deny,
  ).toContain("kit guard");
});

test("/guard off from a folder below the locked root lifts the lock", async ($, on) => {
  setup(on);
  await run($ as never, "on");
  expect((await edit($ as never, "/p/app/biome.json")).deny).toBeDefined();
  await run($ as never, "off");
  expect((await edit($ as never, "/p/app/biome.json")).deny).toBeUndefined();
});
