import type { EngineInterface } from "claude-code";

// What the mod keeps per chat in $.store, under `<prefix><session id>` as { at, ... }: the
// pins (pins.ts) and the latest messages (recent.ts).

export const KEEP_MS = 30 * 24 * 60 * 60 * 1000; // since the entry was last written

// Every read-modify-write goes through here, so two never interleave.
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => {});
  return run;
}

// Other chats' entries older than 30 days go, and those beyond the `max` newest chats (this
// one counted), so the plugin's store (4 MiB in all) can't fill up with them.
export async function pruneChats(
  $: EngineInterface,
  prefix: string,
  keep: string,
  max = Infinity,
) {
  const now = await $.clock.now();
  const others: { key: string; at: number }[] = [];
  for (const key of await $.store.keys()) {
    if (key === keep || !key.startsWith(prefix)) continue;
    const saved = (await $.store.get(key)) as { at?: number } | undefined;
    others.push({ key, at: saved?.at ?? 0 });
  }
  others.sort((a, b) => b.at - a.at);
  for (const [i, other] of others.entries())
    if (i >= max - 1 || !(now - other.at <= KEEP_MS))
      await $.store.delete(other.key);
}
