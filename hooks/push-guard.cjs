#!/usr/bin/env node
/**
 * PreToolUse (Bash): never let `git push` run without the user's explicit OK.
 *
 * - Command contains KIT_PUSH_OK=1 → allowed (the user confirmed in chat).
 * - bypassPermissions mode → deny: only "deny" is guaranteed to hold in that mode
 *   (hooks-guide § Hooks and permission modes), so the reason tells Claude to ask in chat.
 * - Any other mode → "ask": the normal permission prompt shows.
 */

const PUSH = /(^|[\s;&|()`])git(\s+-[cC]\s+\S+)*\s+push\b/;

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }
  if (data.tool_name !== "Bash" && data.tool_name !== "PowerShell") return;

  const cmd = String(data.tool_input?.command ?? "");
  if (!PUSH.test(cmd) || /\bKIT_PUSH_OK=1\b/.test(cmd)) return;

  const bypass = data.permission_mode === "bypassPermissions";
  const reason = bypass
    ? "kit push-guard: pushing needs the user's explicit OK. Ask the user in chat; " +
      "only after they confirm, re-run it prefixed with KIT_PUSH_OK=1 " +
        "(PowerShell: $env:KIT_PUSH_OK=1; git push)."
    : "kit push-guard: confirm this git push.";

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: bypass ? "deny" : "ask",
        permissionDecisionReason: reason,
      },
    }),
  );
}

main();
