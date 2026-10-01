#!/usr/bin/env node
/**
 * Check the working tree before staging. Prints one finding per line:
 *   BLOCK  <path>  <reason>     never stage (secrets)
 *   WARN   <path>  <reason>     ask the user first (large, binary, critical deletion)
 *   IGNORE <pattern>  <reason>  untracked files that .gitignore should cover
 * Exit 0 = nothing found, 1 = findings printed, 2 = not a git repo.
 *
 * Usage: node staging-check.js   (run from the repo root)
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SECRET = [
  /(^|\/)\.env(\..+)?$/,
  /\.env$/,
  /\.(pem|key|pfx|p12|crt)$/,
  /(^|\/)(credentials|secrets)\.json$/,
  /(^|\/)secrets\.ya?ml$/,
  /\.tfvars(\.json)?$/,
  /(^|\/)service-account[^/]*\.json$/,
];
const SECRET_OK = /\.env\.(example|sample|template)$/;
const CRITICAL = [
  /^package(-lock)?\.json$/,
  /^(pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/,
  /^tsconfig\.json$/,
  /^\.gitignore$/,
  /^(AGENTS|CLAUDE)\.md$/,
  /^\.github\//,
];
const IGNORABLE = [
  [/(^|\/)node_modules\//, "node_modules/"],
  [/(^|\/)(vendor|__pycache__|\.venv|venv)\//, "dependency dir"],
  // build/ and out/ only at the repo root: deeper they are often source dirs (e.g. skills/build/)
  [/(^|\/)(dist|\.next|\.nuxt|\.output)\//, "build output"],
  [/^(build|out)\//, "build output"],
  [/(^|\/)\.DS_Store$/, ".DS_Store"],
  [/\.log$/, "*.log"],
  [/(^|\/)\.idea\//, ".idea/"],
];
const MB = 1024 * 1024;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * MB });
}

function isBinary(file) {
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(8000);
    const n = fs.readSync(fd, buf, 0, 8000, 0);
    fs.closeSync(fd);
    return buf.subarray(0, n).includes(0);
  } catch {
    return false;
  }
}

let status;
try {
  // Porcelain paths are relative to the repo root, so resolve files from there.
  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());
  status = git(["status", "--porcelain=v1", "-z"]);
} catch {
  console.log("not a git repository");
  process.exit(2);
}

// Parse -z porcelain: "XY path\0" (renames/copies add "\0origPath").
const entries = [];
const parts = status.split("\0");
for (let i = 0; i < parts.length; i++) {
  const p = parts[i];
  if (!p) continue;
  const xy = p.slice(0, 2);
  entries.push({ xy, file: p.slice(3) });
  if (xy[0] === "R" || xy[0] === "C") i++;
}

// Expand untracked directories, except dirs that should be ignored wholesale.
const files = [];
for (const e of entries) {
  if (e.xy === "??" && e.file.endsWith("/")) {
    const ignorable = IGNORABLE.find(([re]) => re.test(e.file));
    if (ignorable) {
      files.push(e);
      continue;
    }
    const inner = git([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      e.file,
    ]);
    for (const f of inner.split("\0").filter(Boolean))
      files.push({ xy: "??", file: f });
  } else {
    files.push(e);
  }
}

const findings = [];
const ignoreHits = {};
for (const { xy, file } of files) {
  const deleted = xy.includes("D");
  if (SECRET.some((re) => re.test(file)) && !SECRET_OK.test(file) && !deleted) {
    findings.push(`BLOCK  ${file}  secret file`);
    continue;
  }
  if (deleted && CRITICAL.some((re) => re.test(file))) {
    findings.push(`WARN   ${file}  critical file deleted`);
    continue;
  }
  if (xy === "??") {
    const hit = IGNORABLE.find(([re]) => re.test(file));
    if (hit) {
      ignoreHits[hit[1]] = (ignoreHits[hit[1]] || 0) + 1;
      continue;
    }
  }
  if (deleted || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    continue;
  const size = fs.statSync(file).size;
  if (size > MB)
    findings.push(`WARN   ${file}  large file (${(size / MB).toFixed(1)} MB)`);
  else if (isBinary(file)) findings.push(`WARN   ${file}  binary file`);
}
for (const [pattern, n] of Object.entries(ignoreHits)) {
  findings.push(
    `IGNORE ${pattern}  ${n} untracked path(s) not covered by .gitignore`,
  );
}

if (findings.length) {
  console.log(findings.join("\n"));
  process.exit(1);
}
