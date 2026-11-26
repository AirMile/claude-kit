#!/usr/bin/env node
/**
 * Read a claude-config v1 `.project/` folder and print migration material as markdown:
 * open backlog items (from backlog.json), the product source, the project conventions, and
 * the strongest learnings grouped by the directory they belong to. Read-only: it writes
 * nothing. The setup skill decides what to keep.
 *
 * Usage: node migrate-v1.js [projectDir]
 */

const fs = require("fs");
const path = require("path");

// The skill keeps about 15 learnings; this leaves room to choose without flooding the chat.
const MAX_LEARNINGS = 60;

const root = path.resolve(process.argv[2] || ".");
const dir = path.join(root, ".project");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  } catch {
    return null;
  }
}

function oneLine(text, max = 110) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  const first = s.split(/(?<=[.!?])\s/)[0];
  return first.length > max ? first.slice(0, max - 1) + "…" : first;
}

// Directory a learning belongs to: the deepest directory shared by all its paths.
function ownerDir(paths) {
  if (!paths || !paths.length) return ".";
  const parts = paths.map((p) =>
    path.dirname(path.posix.normalize(String(p))).split("/"),
  );
  const common = [];
  for (let i = 0; i < parts[0].length; i++) {
    const seg = parts[0][i];
    if (parts.every((p) => p[i] === seg)) common.push(seg);
    else break;
  }
  const d = common.join("/");
  return d && d !== "." ? d : ".";
}

if (!fs.existsSync(dir)) {
  console.error(`No .project/ in ${root}`);
  process.exit(1);
}

const out = [];

// Backlog
const backlog = readJson("backlog.json");
const features = backlog?.features || [];
const done = features.filter(
  (f) => ["DONE", "shipped"].includes(f.status) || f.shipped,
);
const cancelled = features.filter(
  (f) => f.status === "CANCELLED" && !done.includes(f),
);
const open = features.filter(
  (f) => !done.includes(f) && !cancelled.includes(f),
);
const names = (list) => list.map((f) => f.name).join(", ") || "none";
out.push("## Backlog (from backlog.json, board order)", "");
for (const f of open) {
  const note = f.status === "DOING" ? " (was in progress in v1)" : "";
  out.push(`- ${f.name} · ${oneLine(f.description)}${note}`);
}
if (!open.length) out.push("(no open items)");
out.push(
  "",
  `Done in v1 (not archived): ${names(done)}`,
  `Cancelled in v1 (not migrated): ${names(cancelled)}`,
  "",
);

// Product
const seedFile = path.join(dir, "project-seed.md");
out.push("## Product source (docs/product.md)", "");
if (fs.existsSync(seedFile)) {
  const lines = fs.readFileSync(seedFile, "utf8").split("\n").length;
  out.push(
    `.project/project-seed.md (${lines} lines): condense into docs/product.md`,
  );
} else {
  out.push("none (no .project/project-seed.md)");
}
out.push("");

// Conventions: headings move one level down so they stay inside this section.
const conventionsFile = path.join(dir, "conventions.md");
let conventions = "";
if (fs.existsSync(conventionsFile)) {
  const text = fs.readFileSync(conventionsFile, "utf8");
  // The first marker is the file's own status; later mentions are text.
  const status = text.match(/<!--\s*conventions-status:\s*(\w+)/)?.[1];
  if (status !== "none")
    conventions = text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/^# .*$/m, "")
      .replace(/^(?=##)/gm, "#")
      .trim();
}
out.push("## Conventions (.project/conventions.md)", "");
out.push(conventions || "none", "");

// Learnings
const ctx = readJson("project-context.json");
const learnings = ctx?.learnings || [];
const product = learnings.filter(
  (l) => ownerDir(l.paths).split("/")[0] !== ".project",
);
const rank = (l) => (l.type === "pitfall" ? 1 : 0);
const shown = [...product]
  .sort(
    (a, b) =>
      rank(b) - rank(a) ||
      String(b.date || "").localeCompare(String(a.date || "")),
  )
  .slice(0, MAX_LEARNINGS);
const groups = {};
for (const l of shown) {
  const d = ownerDir(l.paths);
  (groups[d] ||= []).push(l);
}
out.push(`## Learnings (${learnings.length}), grouped by target AGENTS.md`, "");
const left = [];
if (shown.length < product.length)
  left.push(
    `${product.length - shown.length} omitted (pitfalls first, then newest)`,
  );
if (product.length < learnings.length)
  left.push(`${learnings.length - product.length} about v1 tooling left out`);
if (left.length) out.push(`${left.join(" · ")}.`, "");
for (const d of Object.keys(groups).sort()) {
  const gone = d !== "." && !fs.existsSync(path.join(root, d));
  const note = gone ? " (dir no longer exists: place where that code lives now)" : "";
  out.push(`### ${d === "." ? "AGENTS.md (root)" : `${d}/AGENTS.md`}${note}`);
  for (const l of groups[d])
    out.push(`- [${l.type || "note"}] ${oneLine(l.summary, 220)}`);
  out.push("");
}

// CLAUDE.md
const claudeMd = path.join(root, "CLAUDE.md");
out.push("## CLAUDE.md", "");
if (fs.existsSync(claudeMd)) {
  const text = fs.readFileSync(claudeMd, "utf8");
  const isLink = fs.lstatSync(claudeMd).isSymbolicLink();
  const generated = text.includes("GENERATED BY /setup");
  const headings = text.match(/^## .+$/gm) || [];
  out.push(
    `${text.split("\n").length} lines${isLink ? ", symlink" : ""}${generated ? ", v1-generated" : ""}`,
    `sections: ${headings.map((h) => h.slice(3)).join(" | ") || "none"}`,
  );
} else {
  out.push("none");
}
const agentsMd = path.join(root, "AGENTS.md");
if (fs.existsSync(agentsMd) && fs.lstatSync(agentsMd).isSymbolicLink()) {
  out.push(
    `AGENTS.md is a symlink → ${fs.readlinkSync(agentsMd)} (replace with a real file)`,
  );
}

console.log(out.join("\n"));
