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

console.log("codex-find: ok");
