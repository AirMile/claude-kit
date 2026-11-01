#!/usr/bin/env node
/**
 * Read what Codex offers this device. Prints one JSON line:
 *   { argv, state, models: [{ id, name, description }], limits: { five_hour, seven_day, plan }, error? }
 * argv: how to start the Codex CLI here (a path, or ["node", codex.js] behind a Windows shim).
 * state: "missing" (no Codex found), "login" (found, but not logged in with ChatGPT), "ready".
 * models: the catalog's visible models, as `codex app-server` lists them for this account.
 * limits: the ChatGPT plan's windows, { pct, resetsAt (ISO) } each; only a ChatGPT login has them.
 * Exit 0 = read, 1 = Codex missing or not answering (error says why).
 *
 * Usage: node codex-status.js
 */

const { spawn } = require("child_process");
const { findCodex } = require("./codex-find.js");

const WAIT_MS = 15000;

const iso = (seconds) =>
  typeof seconds === "number"
    ? new Date(seconds * 1000).toISOString()
    : undefined;

function windows(rateLimits) {
  const out = { plan: rateLimits?.planType };
  for (const w of [rateLimits?.primary, rateLimits?.secondary]) {
    if (!w) continue;
    const kind = w.windowDurationMins <= 300 ? "five_hour" : "seven_day";
    out[kind] = { pct: w.usedPercent, resetsAt: iso(w.resetsAt) };
  }
  return out;
}

function print(result, code) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(code);
}

const argv = findCodex();
if (!argv)
  print(
    {
      argv: null,
      state: "missing",
      models: [],
      limits: {},
      error: "codex not found: install the Codex CLI",
    },
    1,
  );

// app-server quits at the end of its input before it answers, so stdin stays open until both
// answers are in.
const child = spawn(argv[0], [...argv.slice(1), "app-server"], {
  stdio: ["pipe", "pipe", "ignore"],
});
const result = { argv, state: "ready", models: [], limits: {} };
const pending = new Set([2, 3]);
let buffer = "";
const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
const timer = setTimeout(() => {
  child.kill();
  print({ ...result, error: "codex app-server did not answer" }, 1);
}, WAIT_MS);

child.on("error", (err) => {
  clearTimeout(timer);
  print({ ...result, error: `codex did not start: ${err.message}` }, 1);
});

child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id === 1) {
      send({ method: "initialized" });
      send({ id: 2, method: "model/list", params: {} });
      send({ id: 3, method: "account/rateLimits/read" });
    } else if (msg.id === 2) {
      pending.delete(2);
      result.models = (msg.result?.data ?? [])
        .filter((m) => !m.hidden)
        .map((m) => ({
          id: m.id,
          name: m.displayName,
          description: m.description,
        }));
    } else if (msg.id === 3) {
      pending.delete(3);
      if (msg.result) result.limits = windows(msg.result.rateLimits);
      else {
        result.state = "login";
        result.error = "codex is not logged in with ChatGPT: run `codex login`";
      }
    }
    if (msg.id && !pending.size) {
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      print(result, 0);
    }
  }
});

send({
  id: 1,
  method: "initialize",
  params: { clientInfo: { name: "kit", version: "1" } },
});
