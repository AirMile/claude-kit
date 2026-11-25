#!/usr/bin/env node
/**
 * Regression tests for skills/codex/scripts/codex-find.js. Run: node hooks/codex-find.test.cjs
 */

const assert = require("assert");
const { findCodex } = require("../skills/codex/scripts/codex-find.js");

const has = (...files) => (f) => files.includes(f);
const eq = (got, want) => assert.deepStrictEqual(got, want);

// macOS: the PATH, Homebrew, the official installer's standalone path, else nothing
const mac = { platform: "darwin", home: "/Users/m", env: { PATH: "/usr/bin" } };
eq(findCodex({ ...mac, exists: has("/usr/bin/codex") }), ["/usr/bin/codex"]);
eq(findCodex({ ...mac, exists: has("/opt/homebrew/bin/codex") }), ["/opt/homebrew/bin/codex"]);
const standalone = "/Users/m/.codex/packages/standalone/current/bin/codex";
eq(findCodex({ ...mac, exists: has(standalone) }), [standalone]);
eq(findCodex({ ...mac, exists: () => false }), null);

// CODEX_HOME moves the standalone path
const moved = "/opt/cx/packages/standalone/current/bin/codex";
eq(
  findCodex({ platform: "linux", home: "/home/m", env: { PATH: "", CODEX_HOME: "/opt/cx" }, exists: has(moved) }),
  [moved],
);

// Windows: the installer's codex.exe, or the npm shim run through node
const win = {
  platform: "win32",
  home: "C:\\Users\\m",
  env: { Path: "C:\\Windows", APPDATA: "C:\\Users\\m\\AppData\\Roaming" },
};
const exe = "C:\\Users\\m\\.codex\\packages\\standalone\\current\\bin\\codex.exe";
eq(findCodex({ ...win, exists: has(exe) }), [exe]);
const npm = "C:\\Users\\m\\AppData\\Roaming\\npm";
const js = `${npm}\\node_modules\\@openai\\codex\\bin\\codex.js`;
eq(findCodex({ ...win, exists: has(`${npm}\\codex.cmd`, js) }), ["node", js]);
eq(findCodex({ ...win, exists: has(`${npm}\\codex.cmd`) }), null); // a shim without its script
eq(findCodex({ ...win, exists: has("/opt/homebrew/bin/codex") }), null); // no Mac paths on Windows

// Several installs: the newest version wins, so an outdated CLI does not hide new models
const app = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex";
const homeApp = `/Users/m${app}`;
const old = "/usr/bin/codex";
const pick = (versions, over = {}) =>
  findCodex({
    ...mac,
    exists: has(...Object.keys(versions)),
    real: (f) => f,
    version: ([file]) => versions[file],
    ...over,
  });
eq(pick({ [old]: "codex-cli 0.162.1", [app]: "codex-cli 0.171.0-alpha.13.2" }), [app]);
eq(pick({ [old]: "codex-cli 0.172.0", [app]: "codex-cli 0.171.0-alpha.13.2" }), [old]);
eq(pick({ [old]: "codex-cli 0.9.0", [homeApp]: "codex-cli 0.10.0" }), [homeApp]);
// a release beats its own pre-release; later pre-releases beat earlier ones
eq(pick({ [old]: "codex-cli 0.171.0-alpha.13", [app]: "codex-cli 0.171.0" }), [app]);
eq(pick({ [old]: "codex-cli 0.171.0-alpha.9", [app]: "codex-cli 0.171.0-alpha.13" }), [app]);
eq(pick({ [old]: "codex-cli 0.171.0-alpha.13", [app]: "codex-cli 0.171.0-alpha.13.2" }), [app]);
eq(pick({ [old]: "codex-cli 0.171.0-alpha.9", [app]: "codex-cli 0.171.0-beta.1" }), [app]);
// equal versions keep the first found; one that gives no version loses to one that does
eq(pick({ [old]: "codex-cli 0.172.0", [app]: "codex-cli 0.172.0" }), [old]);
eq(pick({ [old]: "", [app]: "codex-cli 0.1.0" }), [app]);
eq(pick({ [old]: "", [app]: "" }), [old]);
eq(
  pick(
    { [old]: "", [app]: "codex-cli 0.1.0" },
    { version: ([file]) => { if (file === old) throw new Error("broken"); return "codex-cli 0.1.0"; } },
  ),
  [app],
);
// one install, also under two names, is not started to read its version
// counted, not thrown: findCodex swallows a failing read
let reads = 0;
const counted = () => (reads++, "");
eq(pick({ [old]: "" }, { version: counted }), [old]);
eq(pick({ [old]: "", [standalone]: "" }, { version: counted, real: () => "/one/codex" }), [old]);
eq(reads, 0);
// Windows: a newer npm install beats an older codex.exe
eq(
  findCodex({
    ...win,
    exists: has(exe, `${npm}\\codex.cmd`, js),
    real: (f) => f,
    version: (argv) => (argv[0] === "node" ? "codex-cli 0.172.0" : "codex-cli 0.162.1"),
  }),
  ["node", js],
);

// An install that hangs and ignores the stop signal may not hold up the others (real processes)
if (process.platform !== "win32") {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-find-"));
  const install = (name, script) => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "codex"), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    return dir;
  };
  const hung = install("hung", 'trap "" TERM\nsleep 9');
  const good = install("good", "echo codex-cli 1.0.0");
  const started = Date.now();
  const got = findCodex({
    home: root,
    env: { PATH: `${hung}:${good}` },
    exists: (f) => f.startsWith(root) && fs.existsSync(f),
  });
  const ms = Date.now() - started;
  fs.rmSync(root, { recursive: true, force: true });
  eq(got, [path.join(good, "codex")]);
  assert.ok(ms < 6000, `a hung install held the finder for ${ms} ms`);
}

console.log("codex-find: ok");
