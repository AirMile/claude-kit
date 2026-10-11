#!/usr/bin/env node
/** Codex-compatible push guard and format-on-save hooks. */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PUSH = /(^|[\s;&|()`])git(\s+-[cC]\s+\S+)*\s+push\b/;
const FORMATTABLE = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".jsonc",
]);
const PRETTIER_ONLY = new Set([
  ".scss",
  ".less",
  ".md",
  ".mdx",
  ".html",
  ".yml",
  ".yaml",
  ".graphql",
  ".gql",
]);

function denyPush(command) {
  if (!PUSH.test(command)) return false;
  if (/^\s*(?:KIT_PUSH_OK=1\s+|\$env:KIT_PUSH_OK=1;\s*)/i.test(command)) {
    return false;
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "kit push-guard: pushing needs the user's explicit OK. Ask the user in chat; " +
          "after they confirm, re-run it prefixed with KIT_PUSH_OK=1 " +
          "(PowerShell: $env:KIT_PUSH_OK=1; git push).",
      },
    }),
  );
  return true;
}

function filesFrom(input) {
  const files = new Set();
  for (const value of [input.file_path, input.path]) {
    if (typeof value === "string" && value.length > 0) files.add(value);
  }

  const patch = String(input.command ?? "");
  for (const match of patch.matchAll(/^\*\*\* (?:Update|Add) File: (.+)$/gm)) {
    files.add(match[1].trim());
  }

  return [...files];
}

function run(args, cwd) {
  const options = { stdio: "pipe", timeout: 20000, cwd };
  try {
    if (process.platform === "win32") {
      execFileSync(
        "npx.cmd",
        args.map((arg) => `"${arg}"`),
        { ...options, shell: true },
      );
    } else {
      execFileSync("npx", args, options);
    }
  } catch {
    // Formatting must never block an edit.
  }
}

function formatFiles(input, data) {
  const cwd = data.cwd || process.cwd();
  const biome = fs.existsSync(path.join(cwd, "biome.json"));

  for (const file of filesFrom(input)) {
    const extension = path.extname(file).toLowerCase();
    if (FORMATTABLE.has(extension)) {
      run(
        biome
          ? ["biome", "format", "--write", file]
          : ["prettier", "--write", file],
        cwd,
      );
    } else if (PRETTIER_ONLY.has(extension)) {
      run(["prettier", "--write", file], cwd);
    }
  }
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  const input = data.tool_input ?? {};
  if (data.tool_name === "Bash") {
    denyPush(String(input.command ?? ""));
    return;
  }

  formatFiles(input, data);
}

main();
