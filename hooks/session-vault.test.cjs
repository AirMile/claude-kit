#!/usr/bin/env node
/**
 * Tests for session-vault.cjs. Run: node hooks/session-vault.test.cjs
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const hook = path.join(__dirname, "session-vault.cjs");
const tmp = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "kit-vault-")),
);
let failed = 0;

// HOME/USERPROFILE point at tmp so `~` paths resolve inside the test folder.
function run(cwd) {
  const env = { ...process.env, HOME: tmp, USERPROFILE: tmp };
  const out = execFileSync("node", [hook], {
    input: JSON.stringify({ cwd }),
    encoding: "utf8",
    env,
  });
  return out ? JSON.parse(out).hookSpecificOutput.additionalContext : "";
}

function check(name, got, pattern) {
  const ok = pattern instanceof RegExp ? pattern.test(got) : got === pattern;
  if (!ok) {
    failed++;
    console.log(`FAIL ${name}: ${JSON.stringify(got)}`);
  } else console.log(`ok   ${name}`);
}

function project(name, agents, docs = true) {
  const repo = path.join(tmp, "repos", name);
  fs.mkdirSync(repo, { recursive: true });
  if (docs) fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
  if (agents !== null) fs.writeFileSync(path.join(repo, "AGENTS.md"), agents);
  return repo;
}

const line = (p) =>
  `# x\n\n## Backlog\n\n- Notes for the user: the Obsidian folder \`${p}\`.\n`;
const vault = path.join(tmp, "Vault", "Projects", "Demo");

check("no AGENTS.md", run(project("none", null)), "");
check(
  "no folder named",
  run(project("plain", "# x\n\n## Backlog\n\n- Todoist `x`.\n")),
  "",
);
check(
  "folder missing",
  run(project("missing", line(vault))),
  /Obsidian folder missing: .*Demo/,
);

fs.mkdirSync(vault, { recursive: true });
const ok = project("ok", line(vault));
check("docs link missing", run(ok), /docs link missing at .*Demo[\\/]docs/);
check(
  "no docs in repo: silent",
  run(project("nodocs", line(vault), false)),
  "",
);

fs.mkdirSync(path.join(vault, "docs"));
check("real folder", run(ok), /is a real folder, not a docs link/);
fs.rmdirSync(path.join(vault, "docs"));

fs.symlinkSync(path.join(tmp, "gone"), path.join(vault, "docs"), "junction");
check("broken link", run(ok), /docs link at .* is broken/);
fs.unlinkSync(path.join(vault, "docs"));

fs.symlinkSync(path.join(ok, "docs"), path.join(vault, "docs"), "junction");
check("all fine: silent", run(ok), "");

// Point at an empty folder so a match shows up as "docs link missing".
const empty = path.join(tmp, "Vault", "Projects", "Empty");
fs.mkdirSync(empty, { recursive: true });
check(
  "tilde path",
  run(project("tilde", line("~/Vault/Projects/Empty"))),
  /docs link missing/,
);
check(
  "wrapped path and words",
  run(
    project(
      "wrapped",
      "- Notes: the Obsidian\n  folder `" +
        tmp +
        "/Vault/Projects/\n  Empty`.\n",
    ),
  ),
  /docs link missing at .*Empty/,
);
check("UNC path ignored", run(project("unc", line("//evil/share/x"))), "");
check(
  "backslash UNC ignored",
  run(project("unc2", line("\\\\evil\\share\\x"))),
  "",
);
check(
  "relative path ignored",
  run(project("rel", line("Vault/Projects/Empty"))),
  "",
);
check(
  "fenced example ignored",
  run(project("fenced", "```\n- the Obsidian folder `" + empty + "`\n```\n")),
  "",
);

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
