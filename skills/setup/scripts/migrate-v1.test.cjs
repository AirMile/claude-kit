#!/usr/bin/env node
/**
 * Tests for the read-only v1 migration report.
 * Usage: node skills/setup/scripts/migrate-v1.test.cjs
 */

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const SCRIPT = path.join(__dirname, "migrate-v1.js");

function report(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-migrate-v1-"));
  try {
    fs.mkdirSync(path.join(root, ".project"));
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        typeof content === "string" ? content : JSON.stringify(content),
      );
    }
    return execFileSync(process.execPath, [SCRIPT, root], { encoding: "utf8" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const section = (out, title) =>
  out.split(/^## /m).find((part) => part.startsWith(title)) || "";

test("cancelled items are not open backlog", () => {
  const out = report({
    ".project/backlog.json": {
      features: [
        { name: "keep-me", status: "TODO", description: "Open." },
        { name: "busy", status: "DOING", description: "Busy." },
        { name: "dropped", status: "CANCELLED", description: "No." },
        { name: "built", status: "DONE", description: "Yes." },
        { name: "live", status: "TODO", shipped: true, description: "Yes." },
      ],
    },
  });
  const backlog = section(out, "Backlog");
  assert.match(backlog, /^- keep-me ·/m);
  assert.match(backlog, /^- busy · .*was in progress/m);
  assert.doesNotMatch(backlog, /^- (dropped|built|live) ·/m);
  assert.match(backlog, /Cancelled in v1 \(not migrated\): dropped$/m);
});

test("set conventions are printed in full", () => {
  const out = report({
    ".project/conventions.md":
      "<!-- conventions-status: set -->\n\n# Project Conventions\n\n## Naming\n\n- Scripts are `<verb>.py`.\n",
  });
  const conventions = section(out, "Conventions");
  assert.match(conventions, /- Scripts are `<verb>\.py`\./);
  assert.match(conventions, /^### Naming/m, "headings stay inside the section");
  assert.doesNotMatch(conventions, /conventions-status/);
});

test("conventions marked none or missing say so", () => {
  const none = report({
    ".project/conventions.md":
      "<!-- conventions-status: none -->\n\nGlobal rules apply.\n",
  });
  assert.match(section(none, "Conventions"), /^none$/m);
  assert.doesNotMatch(none, /Global rules apply/);
  assert.match(section(report({}), "Conventions"), /^none$/m);
});

test("quoting the none marker does not hide set conventions", () => {
  const out = report({
    ".project/conventions.md":
      "<!-- conventions-status: set -->\n\n- Never write `conventions-status: none` by hand.\n",
  });
  assert.match(section(out, "Conventions"), /- Never write/);
});

test("many learnings are capped: pitfalls first, then newest", () => {
  const learning = (type, i) => ({
    type,
    date: `2026-01-01T${String(i).padStart(4, "0")}`,
    summary: `${type} number ${i} ${"x".repeat(300)}`,
    paths: [`src/area${i % 7}/file.ts`],
  });
  const learnings = [];
  for (let i = 0; i < 200; i++) learnings.push(learning("observation", i));
  for (let i = 0; i < 100; i++) learnings.push(learning("pitfall", i));
  const out = report({ ".project/project-context.json": { learnings } });
  const lines = out.split("\n").filter((line) => /^- \[\w+\] /.test(line));
  assert.strictEqual(lines.length, 60);
  assert.ok(lines.every((line) => line.startsWith("- [pitfall] ")));
  assert.match(out, /pitfall number 99 /);
  assert.doesNotMatch(out, /pitfall number 39 /);
  assert.match(out, /240 omitted/);
  assert.ok(out.length < 25000, `report is ${out.length} characters`);
});

test("learnings about the v1 tooling itself are left out", () => {
  const out = report({
    ".project/project-context.json": {
      learnings: [
        { type: "pitfall", summary: "Tooling.", paths: [".project/a/b.json"] },
        { type: "pitfall", summary: "Dotted.", paths: ["./.project/c.json"] },
        { type: "pitfall", summary: "Product.", paths: ["src/a.ts"] },
      ],
    },
  });
  assert.match(out, /Product\./);
  assert.doesNotMatch(out, /Tooling\./);
  assert.doesNotMatch(out, /Dotted\./);
  assert.match(out, /2 about v1 tooling/);
});
