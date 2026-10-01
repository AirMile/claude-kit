#!/usr/bin/env node
/**
 * Regression tests for push-guard.cjs. Run: node hooks/push-guard.test.cjs
 */

const { execFileSync } = require("child_process");
const path = require("path");

const guard = path.join(__dirname, "push-guard.cjs");

function decide(command, mode = "default", tool = "Bash") {
  const input = JSON.stringify({
    tool_name: tool,
    permission_mode: mode,
    tool_input: { command },
  });
  const out = execFileSync("node", [guard], { input, encoding: "utf8" });
  return out ? JSON.parse(out).hookSpecificOutput.permissionDecision : "pass";
}

const cases = [
  ["git push", "default", "ask"],
  ["git push origin main", "auto", "ask"],
  ["git push --force", "bypassPermissions", "deny"],
  ["git add . && git push", "default", "ask"],
  ["git -C repo push", "default", "ask"],
  ["cd app; git push -u origin feat", "default", "ask"],
  ["KIT_PUSH_OK=1 git push", "bypassPermissions", "pass"],
  ["KIT_PUSH_OK=1 git push --set-upstream origin feat", "auto", "pass"],
  ["git status", "default", "pass"],
  ['git commit -m "push fix"', "default", "pass"],
  ["echo push", "default", "pass"],
  ["git pull --rebase", "default", "pass"],
  ["git push origin main", "auto", "ask", "PowerShell"],
  ["cd app; git push", "bypassPermissions", "deny", "PowerShell"],
  ["$env:KIT_PUSH_OK=1; git push", "bypassPermissions", "pass", "PowerShell"],
  ["git push", "default", "pass", "Read"],
];

let failed = 0;
for (const [cmd, mode, want, tool] of cases) {
  const got = decide(cmd, mode, tool);
  const ok = got === want;
  if (!ok) failed++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${mode.padEnd(17)} ${want.padEnd(4)} ${cmd}${ok ? "" : `  (got ${got})`}`,
  );
}
console.log(failed ? `\n${failed} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
