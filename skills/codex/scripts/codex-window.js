#!/usr/bin/env node
/**
 * Start ChatGPT's 5h window on a schedule, next to a Claude routine that starts Claude's.
 * A cloud routine cannot reach the local Codex, so this runs on the device (macOS launchd).
 *   node codex-window.js ping                 one tiny read-only Luna request now
 *   node codex-window.js install 08:00 18:00  launchd job that pings at those local times
 *   node codex-window.js uninstall            remove the job
 *   node codex-window.js status               is the job installed, and when
 * Exit 0 = done, 1 = failed (the line printed says why).
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findCodex } = require("./codex-find.js");

const LABEL = "com.kit.codex-window";
const PLIST = path.join(
  os.homedir(),
  "Library",
  "LaunchAgents",
  `${LABEL}.plist`,
);
const LOG = path.join(os.homedir(), ".agents", "kit", "codex-window.log");

const say = (msg, code = 0) => {
  process.stdout.write(`${msg}\n`);
  process.exit(code);
};

// The newest Luna the account lists, by the version in its id (gpt-6-luna > gpt-5.6-luna).
function newestLuna(models) {
  const version = (id) =>
    (id.match(/\d+(\.\d+)*/) || ["0"])[0].split(".").map(Number);
  const cmp = (a, b) => {
    const [x, y] = [version(a.id), version(b.id)];
    for (let i = 0; i < Math.max(x.length, y.length); i++)
      if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
    return 0;
  };
  return models.filter((m) => /luna/i.test(m.id)).sort(cmp)[0];
}

function ping() {
  const argv = findCodex();
  if (!argv) say("codex not found: install the Codex CLI", 1);
  const status = spawnSync("node", [path.join(__dirname, "codex-status.js")], {
    encoding: "utf8",
    timeout: 30000,
  });
  let info;
  try {
    info = JSON.parse(status.stdout.trim().split("\n").pop());
  } catch {
    say("codex status unreadable", 1);
  }
  if (info.state !== "ready")
    say(`codex ${info.state}: ${info.error || "log in"}`, 1);
  const luna = newestLuna(info.models);
  if (!luna) say("no Luna model offered on this account", 1);
  const run = spawnSync(
    argv[0],
    [
      ...argv.slice(1),
      "exec",
      "--ephemeral",
      "--model",
      luna.id,
      "-c",
      'model_reasoning_effort="low"',
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "-",
    ],
    { input: "Reply with: ok", encoding: "utf8", timeout: 60000 },
  );
  if (run.status !== 0)
    say(`codex exec failed (${run.status ?? "timeout"})`, 1);
  say(`pinged ${luna.id} at ${new Date().toISOString()}`);
}

function parseTimes(args) {
  const times = args.map((a) => a.match(/^([01]?\d|2[0-3]):([0-5]\d)$/));
  if (!times.length || times.some((m) => !m))
    say("usage: install HH:MM [HH:MM ...]", 1);
  return times.map((m) => ({ Hour: Number(m[1]), Minute: Number(m[2]) }));
}

function plist(times) {
  const slots = times
    .map(
      (t) =>
        `    <dict><key>Hour</key><integer>${t.Hour}</integer><key>Minute</key><integer>${t.Minute}</integer></dict>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${__filename}</string>
    <string>ping</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${slots}
  </array>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
`;
}

const launchctl = (...a) => spawnSync("launchctl", a, { encoding: "utf8" });
const domain = `gui/${process.getuid ? process.getuid() : 501}`;

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "ping") ping();
else if (cmd === "install" || cmd === "uninstall" || cmd === "status") {
  if (process.platform !== "darwin") say("launchd job is macOS only", 1);
  if (cmd === "status")
    say(fs.existsSync(PLIST) ? `installed: ${PLIST}` : "not installed");
  const times = cmd === "install" ? parseTimes(rest) : [];
  launchctl("bootout", domain, PLIST); // fine when it was not loaded
  if (cmd === "uninstall") {
    fs.rmSync(PLIST, { force: true });
    say("removed");
  }
  // The script's path is baked into the plist: a plugin update that moves it needs a reinstall.
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(PLIST, plist(times));
  const r = launchctl("bootstrap", domain, PLIST);
  if (r.status !== 0) say(`launchctl failed: ${r.stderr.trim()}`, 1);
  say(`installed: ping at ${rest.join(", ")}`);
} else say("usage: ping | install HH:MM ... | uninstall | status", 1);
