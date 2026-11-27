#!/usr/bin/env node
/**
 * SessionStart: checks the project's Obsidian folder and its docs link.
 * AGENTS.md in the session cwd names it as: Obsidian folder `<abs or ~ path>`.
 * Silent when none is named or all is fine; otherwise one additionalContext line.
 * Never writes anything. Input: hook JSON on stdin ({ cwd }).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const isUnc = (p) => /^[\\/]{2}/.test(p);

// Skips fenced blocks, so an example in a code block never counts.
function folderPath(agents) {
  let text = "";
  let fenced = false;
  for (const line of agents.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced) text += line + "\n";
  }
  const m = text.match(/Obsidian\s+folder\s+`([^`]+)`/i);
  if (!m) return null;
  // A path wrapped over lines: no space after a separator, one space otherwise.
  const p = m[1]
    .replace(/([\\/])\s*\n\s*/g, "$1")
    .replace(/\s*\n\s*/g, " ")
    .trim();
  // No UNC/network paths: opening one at session start could leak Windows credentials.
  if (isUnc(p)) return null;
  const full = p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
  return path.isAbsolute(full) && !isUnc(full) ? full : null;
}

function problem(cwd, folder) {
  try {
    if (!fs.statSync(folder).isDirectory()) throw new Error();
  } catch {
    return `Obsidian folder missing: ${folder}`;
  }
  if (!fs.existsSync(path.join(cwd, "docs"))) return null;
  const link = path.join(folder, "docs");
  let st;
  try {
    st = fs.lstatSync(link);
  } catch {
    return `docs link missing at ${link}`;
  }
  // Node reports a Windows junction as a symbolic link too.
  if (!st.isSymbolicLink()) return `${link} is a real folder, not a docs link`;
  try {
    if (!fs.statSync(link).isDirectory()) throw new Error();
  } catch {
    return `docs link at ${link} is broken`;
  }
  return null;
}

function report(cwd) {
  let agents;
  try {
    agents = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
  } catch {
    return null;
  }
  const folder = folderPath(agents);
  if (!folder) return null;
  const p = problem(cwd, folder);
  return p
    ? `kit: ${p} (obsidian skill; offer, change nothing without the user's yes).`
    : null;
}

function main() {
  let input = "";
  try {
    input = fs.readFileSync(0, "utf8");
  } catch {}
  let cwd = process.cwd();
  try {
    cwd = JSON.parse(input).cwd || cwd;
  } catch {}
  const line = report(cwd);
  if (!line) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: line,
      },
    }),
  );
}

if (require.main === module) main();
module.exports = { report, folderPath, problem };
