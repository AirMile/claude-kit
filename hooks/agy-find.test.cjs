#!/usr/bin/env node
/**
 * Regression tests for skills/agy/scripts/agy-find.js. Run: node hooks/agy-find.test.cjs
 * The old finder ran `sh -c 'command -v agy || ...'` with Mac/Linux paths only, so a Windows
 * install (WinGet puts agy.exe in %LOCALAPPDATA%\Microsoft\WinGet\Links) was reported as missing.
 */

const assert = require("assert");
const { findAgy } = require("../skills/agy/scripts/agy-find.js");

const has =
  (...files) =>
  (f) =>
    files.includes(f);
const eq = (got, want) => assert.deepStrictEqual(got, want);

// macOS / Linux: the PATH, ~/.local/bin, Homebrew, else nothing
const mac = { platform: "darwin", home: "/Users/m", env: { PATH: "/usr/bin" } };
eq(findAgy({ ...mac, exists: has("/usr/bin/agy") }), "/usr/bin/agy");
eq(
  findAgy({ ...mac, exists: has("/opt/homebrew/bin/agy") }),
  "/opt/homebrew/bin/agy",
);
eq(
  findAgy({ ...mac, exists: has("/Users/m/.local/bin/agy") }),
  "/Users/m/.local/bin/agy",
);
eq(findAgy({ ...mac, exists: () => false }), null);

// Windows: the PATH, else the WinGet links folder a GUI app's short PATH may lack
const win = {
  platform: "win32",
  home: "C:\\Users\\m",
  env: {
    Path: "C:\\Windows",
    LOCALAPPDATA: "C:\\Users\\m\\AppData\\Local",
    APPDATA: "C:\\Users\\m\\AppData\\Roaming",
  },
};
const winget =
  "C:\\Users\\m\\AppData\\Local\\Microsoft\\WinGet\\Links\\agy.exe";
eq(findAgy({ ...win, exists: has(winget) }), winget);
eq(
  findAgy({
    ...win,
    env: { ...win.env, Path: "C:\\Windows;C:\\tools" },
    exists: has("C:\\tools\\agy.exe"),
  }),
  "C:\\tools\\agy.exe",
);
const npm = "C:\\Users\\m\\AppData\\Roaming\\npm\\agy.exe";
eq(findAgy({ ...win, exists: has(npm) }), npm);
eq(findAgy({ ...win, exists: () => false }), null);
eq(findAgy({ ...win, exists: has("/opt/homebrew/bin/agy") }), null); // no Mac paths on Windows
// without LOCALAPPDATA the default AppData\Local under home is still tried
eq(
  findAgy({ ...win, env: { Path: "C:\\Windows" }, exists: has(winget) }),
  winget,
);

// a quoted PATH entry loses its quotes
eq(
  findAgy({
    ...win,
    env: { Path: '"C:\\CLI Tools"' },
    exists: has("C:\\CLI Tools\\agy.exe"),
  }),
  "C:\\CLI Tools\\agy.exe",
);

console.log("agy-find: ok");
