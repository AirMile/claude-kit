#!/usr/bin/env node
/**
 * PostToolUse (Write|Edit): format the edited file.
 * Biome when the project has biome.json (for the extensions it supports), else Prettier.
 * Failures are silent: formatting must never block an edit.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BIOME_OR_PRETTIER = new Set([
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

function run(args, cwd) {
  const opts = { stdio: "pipe", timeout: 20000, cwd };
  try {
    if (process.platform === "win32") {
      // npx is npx.cmd on Windows; Node only spawns .cmd files through a shell,
      // and a shell joins args unquoted, so quote them (paths may contain spaces).
      execFileSync(
        "npx.cmd",
        args.map((a) => `"${a}"`),
        { ...opts, shell: true },
      );
    } else {
      execFileSync("npx", args, opts);
    }
  } catch {
    // non-blocking
  }
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }

  const file = data.tool_input?.file_path || data.tool_input?.path;
  if (!file) return;

  const ext = path.extname(file).toLowerCase();
  const cwd = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();
  const biome = fs.existsSync(path.join(cwd, "biome.json"));

  if (BIOME_OR_PRETTIER.has(ext)) {
    run(
      biome
        ? ["biome", "format", "--write", file]
        : ["prettier", "--write", file],
      cwd,
    );
  } else if (PRETTIER_ONLY.has(ext)) {
    run(["prettier", "--write", file], cwd);
  }
}

main();
