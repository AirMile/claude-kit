/**
 * Which Codex CLI to use on this device. Pure on its inputs, so a test can fake any platform.
 *   findCodex({ env, home, platform, exists, real, version }) -> argv ([path] or
 *   ["node", codex.js]) or null
 * A GUI app (Claude desktop) often starts with a short PATH, so besides the PATH the usual
 * install places are searched: the official installer's CODEX_HOME/packages/standalone/current/bin
 * (docs: github.com/openai/codex scripts/install), Homebrew, npm, bun, the ChatGPT and Codex apps.
 * Codex lists only the models its version knows, so of several installs the newest wins (its
 * `--version`); equal versions keep the first found.
 */

const { execFileSync } = require("child_process");
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
    // The ChatGPT app carries its own Codex and updates it along with itself.
    "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin",
    p.join(home, "Applications/ChatGPT.app/Contents/Resources/codex-cli/bin"),
  ];
}

// The version in "codex-cli 0.171.0-alpha.13.2": its numbers and pre-release; null when the
// output names none.
function parseVersion(text) {
  const hit = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?/.exec(text);
  return hit ? { numbers: hit.slice(1, 4).map(Number), pre: hit[4] } : null;
}

function newer(a, b) {
  if (!a || !b) return Boolean(a);
  for (let i = 0; i < 3; i++) {
    const diff = a.numbers[i] - b.numbers[i];
    if (diff) return diff > 0;
  }
  if (!a.pre || !b.pre) return !a.pre && Boolean(b.pre); // a release beats its pre-releases
  // alpha before beta, and alpha.9 before alpha.13
  return a.pre.localeCompare(b.pre, "en", { numeric: true }) > 0;
}

const readVersion = ([file, ...args]) =>
  execFileSync(file, [...args, "--version"], {
    encoding: "utf8",
    timeout: 3000,
    killSignal: "SIGKILL", // an install that ignores SIGTERM would hold up the caller
    stdio: ["ignore", "pipe", "ignore"],
  });

const realPath = (file) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
};

function findCodex({
  env = process.env,
  home = os.homedir(),
  platform = process.platform,
  exists = fs.existsSync,
  real = realPath,
  version = readVersion,
} = {}) {
  const win = platform === "win32";
  const p = win ? path.win32 : path.posix;
  const dirs = [
    ...(env.PATH || env.Path || "").split(p.delimiter),
    ...extraDirs({ env, home, platform }),
  ].filter(Boolean);
  const onPath = (name) => dirs.map((dir) => p.join(dir, name)).filter(exists);
  // Each install once, as [what it is, how to start it].
  const found = onPath(win ? "codex.exe" : "codex").map((file) => [file, [file]]);
  if (win) {
    // Windows' npm shim (codex.cmd) can't be spawned without a shell: run the script behind it.
    for (const shim of onPath("codex.cmd")) {
      const js = p.join(p.dirname(shim), "node_modules", "@openai", "codex", "bin", "codex.js");
      if (exists(js)) found.push([js, ["node", js]]);
    }
  }
  const installs = new Map();
  for (const [file, argv] of found) {
    const key = real(file);
    if (!installs.has(key)) installs.set(key, argv);
  }
  const all = [...installs.values()];
  if (all.length < 2) return all[0] || null;
  let best;
  for (const argv of all) {
    let got = null;
    try {
      got = parseVersion(version(argv));
    } catch {
      // does not start: any install that does is better
    }
    if (!best || newer(got, best.version)) best = { argv, version: got };
  }
  return best.argv;
}

module.exports = { findCodex, extraDirs };
