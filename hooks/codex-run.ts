import type { EngineInterface } from "claude-code";
import { noteGptMeters } from "./delegate-balance";

import {
  type CatalogModel,
  type Family,
  type Meters,
  newest,
  type Route,
} from "./delegate-policy";

// The Codex side of mcp__kit__delegate (delegate.ts): what Codex offers this device, read by
// skills/codex/scripts/codex-status.js at most every 10 minutes (its catalog and the ChatGPT
// meters), and one Codex run, read from its JSON events. Only the final message is kept; the
// whole run stays in Codex's own session file.

const PINS_KEY = "gptPins";
const GPT_KEY = "gpt";
const FRESH_MS = 10 * 60_000;
const MAX_RUN_MS = 45 * 60_000;

type Limits = Meters & { plan?: string };
export type GptStatus = {
  argv: string[] | null;
  models: CatalogModel[];
  limits: Limits;
  error?: string;
  at: number;
};

let status: GptStatus | undefined;
let gpt: boolean | undefined; // the band's GPT switch, read from $.store on first use
let loading: Promise<GptStatus> | undefined;

// The band's GPT switch (on unless turned off, kept across sessions): off, no GPT model is used
// unless the user names one, Codex is not read and the band shows no ChatGPT meters.
export async function gptOn($: EngineInterface): Promise<boolean> {
  if (gpt === undefined) {
    gpt = (await $.store.get(GPT_KEY).catch(() => undefined)) !== false;
    await refreshBalance($);
  }
  return gpt;
}

export async function setGptOn($: EngineInterface, next: boolean) {
  gpt = next;
  await refreshBalance($);
  await $.store.set(GPT_KEY, next).catch(() => {});
}

async function refreshBalance($: EngineInterface) {
  noteGptMeters(
    gpt !== false,
    status?.argv && !status.error ? status.limits : undefined,
    await $.clock.now(),
  );
}

export const gptCached = (): GptStatus | undefined => status;

async function readStatus($: EngineInterface): Promise<GptStatus> {
  const at = await $.clock.now();
  const script = `${$.plugin.root}/skills/codex/scripts/codex-status.js`;
  const ran = await $.process
    .run(["node", script], { timeoutMs: 25_000 })
    .catch(() => null);
  let got: Partial<GptStatus> | undefined;
  try {
    got = JSON.parse(ran?.stdout.trim().split("\n").pop() ?? "");
  } catch {
    got = undefined;
  }
  status = {
    argv: got?.argv ?? null,
    models: got?.models ?? [],
    limits: got?.limits ?? {},
    error: got ? got.error : "codex-status.js gave no answer",
    at,
  };
  await refreshBalance($);
  return status;
}

export async function gptStatus(
  $: EngineInterface,
  force = false,
): Promise<GptStatus> {
  const now = await $.clock.now();
  if (!force && status && now - status.at < FRESH_MS) return status;
  loading ??= readStatus($).finally(() => {
    loading = undefined;
  });
  return loading;
}

export async function pins(
  $: EngineInterface,
): Promise<Partial<Record<Family, string>>> {
  const stored = await $.store.get(PINS_KEY).catch(() => undefined);
  return stored && typeof stored === "object"
    ? (stored as Record<Family, string>)
    : {};
}

export async function setPins(
  $: EngineInterface,
  next: Partial<Record<Family, string>>,
) {
  await $.store.set(PINS_KEY, next).catch(() => {});
}

// The newest model per family from the catalog read last, pins applied: no Codex run, so the
// band can draw with it.
export async function gptNamesCached(
  $: EngineInterface,
): Promise<Partial<Record<Family, { name: string }>>> {
  return status ? newest(status.models, await pins($)) : {};
}

export function codexArgs(
  r: Extract<Route, { provider: "gpt" }>,
  root: string,
  thread?: string,
): string[] {
  const effort = `model_reasoning_effort="${r.effort}"`;
  if (thread)
    return [
      "exec",
      "resume",
      thread,
      "--json",
      "--model",
      r.model,
      "-c",
      effort,
      "-c",
      `sandbox_mode="${r.sandbox}"`,
      "--skip-git-repo-check",
      "-",
    ];
  return [
    "exec",
    "--json",
    "--model",
    r.model,
    "-c",
    effort,
    "--sandbox",
    r.sandbox,
    "--skip-git-repo-check",
    "-C",
    root,
    "-",
  ];
}

export async function changed(
  $: EngineInterface,
  root: string,
): Promise<Set<string>> {
  const ran = await $.process
    .run(["git", "status", "--porcelain"], { cwd: root })
    .catch(() => null);
  return new Set((ran?.stdout ?? "").split("\n").filter(Boolean));
}

export const took = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

export type Run = {
  answer: string;
  thread?: string;
  commands: number;
  error?: string;
  code?: number;
};

// Runs `codex exec` and reads its JSON events. A review runs this way too: `codex review
// --uncommitted` takes no brief of its own (Codex 0.162), and without one it misses the intent.
export async function runCodex(
  $: EngineInterface,
  argv: string[],
  brief: string,
  root: string,
  show: (line: string) => Promise<void>,
): Promise<Run> {
  const run: Run = { answer: "", commands: 0 };
  let buffer = "";
  let stderr = "";
  const stream = $.process.spawn({ argv, cwd: root, input: brief });
  const started = await $.clock.now();
  for await (const { stream: pipe, text } of stream) {
    if (pipe === "stderr") {
      stderr = (stderr + text).slice(-4000);
    } else {
      buffer += text;
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        let ev: {
          type?: string;
          thread_id?: string;
          item?: { type?: string; text?: string };
          error?: { message?: string };
          message?: string;
        };
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.type === "thread.started") run.thread = ev.thread_id;
        if (ev.type === "item.completed" && ev.item?.type === "agent_message")
          run.answer = ev.item.text ?? run.answer;
        if (
          ev.type === "item.completed" &&
          ev.item?.type === "command_execution"
        )
          run.commands++;
        if (ev.type === "turn.failed" || ev.type === "error")
          run.error = ev.error?.message ?? ev.message ?? ev.type;
      }
    }
    const now = await $.clock.now();
    await show(`${took(now - started)} · ${run.commands} commands`);
    if (now - started > MAX_RUN_MS) {
      run.error = `stopped after ${took(MAX_RUN_MS)}`;
      break; // leaving the loop ends the child
    }
  }
  const end = await stream.result.catch(() => undefined);
  run.code = end?.code ?? undefined;
  if (run.code && !run.error)
    run.error = stderr.trim().split("\n").slice(-6).join("\n");
  return run;
}
