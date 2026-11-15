import type { CheckKind } from "./flow-check";
import type { Task } from "./flow-policy";

// Evidence per kind of check, pure. A failing check opens its kinds; a pass closes a kind only
// when it started after the kind's last failure or edit (`failedAt`); an edit reopens every
// kind closed before it, so a pass on older code never stands in for the code now.
const without = (kinds: CheckKind[], gone: Iterable<CheckKind>) => {
  const drop = new Set(gone);
  return kinds.filter((k) => !drop.has(k));
};

// A check ran. A pass is evidence for the worktree it started on; a failure wipes earlier
// evidence (a later lint pass must not stand in for failing tests).
export function onCheck(
  task: Task,
  passed: boolean,
  startedAt: number,
  startPrint: string | undefined,
  checked: CheckKind | readonly CheckKind[],
): Task {
  const kinds = typeof checked === "string" ? [checked] : checked;
  if (passed) {
    // A kind closed on other code (a formatter or a Bash edit changed it since) must pass again.
    const stale = (task.closedKinds ?? []).filter((k) => {
      const at = task.closedPrints?.[k];
      return startPrint !== undefined && at !== undefined && at !== startPrint;
    });
    if (stale.length) task = reopen(task, startedAt, stale);
  }
  const failedAt = { ...task.failedAt };
  if (!passed) {
    for (const k of kinds)
      failedAt[k] = Math.max(failedAt[k] ?? 0, startedAt);
    return {
      ...task,
      openKinds: [...new Set([...(task.openKinds ?? []), ...kinds])],
      closedKinds: without(task.closedKinds ?? [], kinds),
      failedAt,
      failed: task.failed + 1,
      lastCheckAt: 0,
      checkedPrint: undefined,
    };
  }
  const open = task.openKinds ?? [];
  const fresh = kinds.filter((k) => startedAt >= (failedAt[k] ?? 0));
  const closing = fresh.filter((k) => open.includes(k));
  for (const k of closing) delete failedAt[k];
  const openKinds = without(open, closing);
  const closedPrints = { ...task.closedPrints };
  for (const k of closing)
    if (startPrint !== undefined) closedPrints[k] = startPrint;
  return {
    ...task,
    openKinds,
    closedPrints,
    closedKinds: [...new Set([...(task.closedKinds ?? []), ...closing])],
    failedAt,
    checks: task.checks + 1,
    ...(fresh.length === kinds.length && !openKinds.length
      ? { lastCheckAt: startedAt, checkedPrint: startPrint }
      : {}),
  };
}

// Code changed at `now`: kinds that were closed or still open must pass again after this moment
// (only `kinds` when a pass on other code shows the change).
export function reopen(
  task: Task,
  now: number,
  kinds?: readonly CheckKind[],
): Task {
  const touched = kinds ?? [
    ...new Set([...(task.openKinds ?? []), ...(task.closedKinds ?? [])]),
  ];
  if (!touched.length) return task;
  const failedAt = { ...task.failedAt };
  const closedPrints = { ...task.closedPrints };
  for (const k of touched) {
    failedAt[k] = now;
    delete closedPrints[k];
  }
  return {
    ...task,
    openKinds: [...new Set([...(task.openKinds ?? []), ...touched])],
    closedKinds: without(task.closedKinds ?? [], touched),
    failedAt,
    closedPrints,
  };
}
