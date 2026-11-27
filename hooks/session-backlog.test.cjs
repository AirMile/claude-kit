#!/usr/bin/env node
/**
 * Tests for session-backlog.cjs. Run: node hooks/session-backlog.test.cjs
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const hook = path.join(__dirname, "session-backlog.cjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit-backlog-"));
let failed = 0;

function run(cwd) {
  const out = execFileSync("node", [hook], {
    input: JSON.stringify({ cwd }),
    encoding: "utf8",
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

function project(name, backlog) {
  const repo = path.join(tmp, name, "repo");
  fs.mkdirSync(repo, { recursive: true });
  if (backlog !== null) {
    fs.writeFileSync(
      path.join(repo, "AGENTS.md"),
      `# x\n\n## Backlog\n\n${backlog}\n\n## Docs\n\n- see \`docs/a.md\`\n`,
    );
  }
  return repo;
}

const vault = path.join(tmp, "vault", "Projects", "Demo");
fs.mkdirSync(vault, { recursive: true });
const note = path.join(vault, "Demo backlog.md");
fs.writeFileSync(
  note,
  "---\nproject: Demo\n---\n\n# Demo backlog\n\n## Nu\n\n- [ ] First item\n- [x] Done\n- [ ] Second\n\n## Hierna\n\n- [ ] Later\n",
);

check("no AGENTS.md", run(project("none", null)), "");
check(
  "todoist stays silent",
  run(project("todo", "- The backlog is the Todoist project `x`.")),
  "",
);
check(
  "missing note",
  run(
    project(
      "missing",
      "- The backlog is the Obsidian note `/nope/X backlog.md`.",
    ),
  ),
  /backlog note missing: \/nope\/X backlog\.md/,
);

const ok = project("ok", `- The backlog is the Obsidian note \`${note}\`.`);
const okRe = /2 open in first section \(obsidian skill/;
check("counts first section", run(ok), okRe);
check("item text is not passed on", run(ok), /^(?!.*First item)/);

check(
  "other .md path does not win",
  run(
    project(
      "mixed",
      `- See \`docs/x.md\`. The backlog is the Obsidian note \`${note}\`.`,
    ),
  ),
  okRe,
);
check(
  "todoist with an obsidian mention stays silent",
  run(
    project(
      "todo2",
      "- The backlog is the Todoist project `x`; notes in Obsidian `a.md`.",
    ),
  ),
  "",
);

const fencedNote = path.join(vault, "Fenced backlog.md");
fs.writeFileSync(
  fencedNote,
  "# F\n\n```\n## Fake\n- [ ] no\n```\n\n##\tNu\n\n- [ ] a\n\n## Next\n- [ ] b\n",
);
check(
  "fenced heading skipped, tab heading counted",
  run(
    project("fenced", `- The backlog is the Obsidian note \`${fencedNote}\`.`),
  ),
  /1 open in first section/,
);

check(
  "UNC path ignored",
  run(
    project(
      "unc",
      "- The backlog is the Obsidian note `\\\\\\\\evil\\\\share\\\\x backlog.md`.",
    ),
  ),
  "",
);
check(
  "relative path ignored",
  run(
    project("rel", "- The backlog is the Obsidian note `notes/x backlog.md`."),
  ),
  "",
);

fs.mkdirSync(path.join(ok, "docs"));
check("docs link missing", run(ok), /docs link missing at .*Demo[\\/]docs/);

fs.mkdirSync(path.join(vault, "docs"));
check(
  "real docs folder is not a link",
  run(ok),
  /is a real folder, not a docs link/,
);
fs.rmdirSync(path.join(vault, "docs"));

fs.symlinkSync(path.join(tmp, "gone"), path.join(vault, "docs"), "junction");
check("broken link", run(ok), /docs link at .* is broken/);
fs.unlinkSync(path.join(vault, "docs"));

fs.symlinkSync(path.join(ok, "docs"), path.join(vault, "docs"), "junction");
check(
  "docs link present",
  run(ok),
  /^kit: backlog .* open in first section \(obsidian skill/,
);

const home = os.homedir();
if (note.startsWith(home)) {
  const tilde = project(
    "tilde",
    `- The backlog is the Obsidian note \`~${note.slice(home.length)}\`.`,
  );
  check("tilde path", run(tilde), /2 open/);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
