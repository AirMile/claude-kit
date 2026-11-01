/**
 * Where the Codex CLI may be on this device. Pure on its inputs, so a test can fake any platform.
 *   findCodex({ env, home, platform, exists }) -> argv ([path] or ["node", codex.js]) or null
 * A GUI app (Claude desktop) often starts with a short PATH, so besides the PATH the usual
 * install places are searched: the official installer's CODEX_HOME/packages/standalone/current/bin
 * (docs: github.com/openai/codex scripts/install), Homebrew, npm, bun, the Codex app.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

function extraDirs({ env, home, platform }) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const codexHome = env.CODEX_HOME || p.join(home, ".codex");
  const standalone = p.join(codexHome, "packages", "standalone", "current", "bin");
  if (platform === "win32") {
    return [
      standalone,
      env.APPDATA && p.join(env.APPDATA, "npm"),
      p.join(home, ".bun", "bin"),
      p.join(home, "scoop", "shims"),
    ].filter(Boolean);
  }
  return [
    p.join(home, ".local", "bin"),
    standalone,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    p.join(home, ".npm-global", "bin"),
    p.join(home, ".bun", "bin"),
    p.join(home, ".volta", "bin"),
    "/Applications/Codex.app/Contents/Resources",
  ];
}

function findCodex({
  env = process.env,
  home = os.homedir(),
  platform = process.platform,
  exists = fs.existsSync,
} = {}) {
  const win = platform === "win32";
  const p = win ? path.win32 : path.posix;
  const dirs = [
    ...(env.PATH || env.Path || "").split(p.delimiter),
    ...extraDirs({ env, home, platform }),
  ].filter(Boolean);
  const onPath = (names) => {
    for (const dir of dirs)
      for (const name of names) {
        const file = p.join(dir, name);
        if (exists(file)) return file;
      }
    return null;
  };
  if (!win) {
    const found = onPath(["codex"]);
    return found ? [found] : null;
  }
  // Windows' npm shim (codex.cmd) can't be spawned without a shell: run the script behind it.
  const exe = onPath(["codex.exe"]);
  if (exe) return [exe];
  const shim = onPath(["codex.cmd"]);
  const js = shim
    ? p.join(p.dirname(shim), "node_modules", "@openai", "codex", "bin", "codex.js")
    : null;
  return js && exists(js) ? ["node", js] : null;
}

module.exports = { findCodex, extraDirs };
