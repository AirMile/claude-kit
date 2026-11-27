#!/usr/bin/env node
/**
 * SessionStart: one line on the project's Obsidian backlog note and docs link.
 * Reads AGENTS.md § Backlog in the session cwd; silent unless it names an Obsidian note.
 * Never writes anything. Input: hook JSON on stdin ({ cwd }).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

function backlogSection(agents) {
  const m = agents.match(
    /^## Backlog[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m,
  );
  return m ? m[1] : "";
}

// Only "Obsidian note `<path> backlog.md`" counts, so another .md path in the section can't win.
function notePath(section) {
  const m = section.match(/Obsidian note\s+`([^`]*backlog\.md)`/i);
  if (!m) return null;
  const p = m[1];
  // No UNC/network paths: opening one at session start could leak Windows credentials.
  if (/^[\\/]{2}/.test(p)) return null;
  const full = p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
  return path.isAbsolute(full) && !/^[\\/]{2}/.test(full) ? full : null;
}

// Counts only: item text is not passed to the model, so a note can't inject instructions.
function openInFirstSection(note) {
  let inSection = false;
  let fenced = false;
  let count = 0;
  for (const line of note.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    if (/^##[ \t]/.test(line)) {
      if (inSection) break;
      inSection = true;
      continue;
    }
    if (inSection && /^\s*- \[ \] \S/.test(line)) count++;
  }
  return count;
}

function linkState(cwd, note) {
  const docs = path.join(cwd, "docs");
  if (!fs.existsSync(docs)) return null;
  const link = path.join(path.dirname(note), "docs");
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
  const note = notePath(backlogSection(agents));
  if (!note) return null;

  const parts = [];
  try {
    parts.push(
      `kit: backlog ${note} · ${openInFirstSection(fs.readFileSync(note, "utf8"))} open in first section`,
    );
  } catch {
    parts.push(`kit: backlog note missing: ${note}`);
  }
  const link = linkState(cwd, note);
  if (link) parts.push(link);
  return (
    parts.join(" · ") +
    " (obsidian skill; change nothing without the user's yes)."
  );
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
module.exports = {
  report,
  backlogSection,
  notePath,
  openInFirstSection,
  linkState,
};
