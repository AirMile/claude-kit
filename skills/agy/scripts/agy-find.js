/**
 * Where the Antigravity CLI (agy) may be on this device. Pure on its inputs, so a test can fake
 * any platform.   findAgy({ env, home, platform, exists }) -> absolute path or null
 * A GUI app (Claude desktop) often starts with a short PATH, so besides the PATH the usual
 * install places are searched: WinGet's links folder and npm on Windows; ~/.local/bin and
 * Homebrew elsewhere. Run as a script it prints the path (nothing when agy is not found).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

function extraDirs({ env, home, platform }) {
  const p = platform === "win32" ? path.win32 : path.posix;
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || p.join(home, "AppData", "Local");
    const roaming = env.APPDATA || p.join(home, "AppData", "Roaming");
    return [
      p.join(local, "Microsoft", "WinGet", "Links"),
      p.join(roaming, "npm"),
      p.join(home, ".local", "bin"),
      p.join(home, "scoop", "shims"),
    ];
  }
  return [
    p.join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    p.join(home, ".npm-global", "bin"),
  ];
}

function findAgy({
  env = process.env,
  home = os.homedir(),
  platform = process.platform,
  exists = fs.existsSync,
} = {}) {
  const win = platform === "win32";
  const p = win ? path.win32 : path.posix;
  const dirs = [
    ...(env.PATH || env.Path || "").split(p.delimiter).map((d) => d.replace(/^"(.*)"$/, "$1")),
    ...extraDirs({ env, home, platform }),
  ].filter(Boolean);
  for (const dir of dirs) {
    const file = p.join(dir, win ? "agy.exe" : "agy");
    if (exists(file)) return file;
  }
  return null;
}

if (require.main === module) {
  const found = findAgy();
  if (found) console.log(found);
}

module.exports = { findAgy, extraDirs };
