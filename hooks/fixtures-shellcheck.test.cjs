#!/usr/bin/env node
/**
 * Runs shellcheck (warnings and errors; info such as SC2016 is intended in the markdown printf lines) on every evals/<case>/fixture.sh. Skips (exit 0) when shellcheck is not
 * installed. Run: node hooks/fixtures-shellcheck.test.cjs
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const evals = path.join(__dirname, "..", "evals");
const files = fs
  .readdirSync(evals, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(evals, d.name, "fixture.sh"))
  .filter((f) => fs.existsSync(f));

const probe = spawnSync("shellcheck", ["--version"], { encoding: "utf8" });
if (probe.error) {
  console.log("shellcheck not installed: skipped");
  process.exit(0);
}

const run = spawnSync("shellcheck", ["--severity=warning", ...files], { encoding: "utf8" });
if (run.status !== 0) {
  console.error(run.stdout + run.stderr);
  console.error(`shellcheck failed on ${files.length} fixtures`);
  process.exit(1);
}
console.log(`shellcheck ok: ${files.length} fixtures`);
