#!/usr/bin/env node
/**
 * Regression tests for codex-hooks.cjs and the manifests. Run: node hooks/codex-hooks.test.cjs
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { filesFrom } = require("./codex-hooks.cjs");

const hook = path.join(__dirname, "codex-hooks.cjs");
const root = path.join(__dirname, "..");

function run(data) {
  const out = execFileSync("node", [hook], {
    input: JSON.stringify(data),
    encoding: "utf8",
  });
  return out ? JSON.parse(out).hookSpecificOutput : null;
}

function push(command) {
  const out = run({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command },
  });
  return out ? out.permissionDecision : "pass";
}

const version = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).version;

const patch = [
  "*** Begin Patch",
  "*** Add File: src/new.ts",
  "+export const a = 1;",
  "*** Update File: src/old.ts",
  "*** Move to: src/moved.ts",
  "@@",
  "*** Update File: styles/app.css",
  "@@",
  "*** End Patch",
].join("\n");

const cases = [
  ["git push is denied", () => push("git push"), "deny"],
  [
    "git -C repo push is denied",
    () => push("git -C repo push origin main"),
    "deny",
  ],
  ["push after && is denied", () => push("git add . && git push"), "deny"],
  [
    "KIT_PUSH_OK=1 passes",
    () => push("KIT_PUSH_OK=1 git push -u origin HEAD"),
    "pass",
  ],
  ["PowerShell OK passes", () => push("$env:KIT_PUSH_OK=1; git push"), "pass"],
  ["git commit passes", () => push('git commit -m "push fix"'), "pass"],
  [
    "apply_patch: added, updated, moved files",
    () => filesFrom({ command: patch }).join(" "),
    "src/new.ts src/old.ts src/moved.ts styles/app.css",
  ],
  [
    "Write/Edit file_path",
    () => filesFrom({ file_path: "a.ts" }).join(" "),
    "a.ts",
  ],
  [
    "SessionStart adds the kit context",
    () => {
      const out = run({ hook_event_name: "SessionStart", source: "startup" });
      return out.hookEventName === "SessionStart" &&
        out.additionalContext.includes("AskUserQuestion")
        ? "context"
        : JSON.stringify(out);
    },
    "context",
  ],
  [
    "manifest versions match",
    () => version(".codex-plugin/plugin.json"),
    version(".claude-plugin/plugin.json"),
  ],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const value = got();
  const ok = value === want;
  if (!ok) failed++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `  (got ${value}, want ${want})`}`,
  );
}
console.log(failed ? `\n${failed} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
