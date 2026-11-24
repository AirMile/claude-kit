import type { CheckKind } from "./flow-check";
import { failureHash, pristine } from "./flow-required";
import type { Task } from "./flow-policy";

// Evidence per kind of check, pure. A failing check opens its kinds; a pass closes a kind only
// when it started after the kind's last failure or edit (`failedAt`); an edit reopens every
// kind closed before it, so a pass on older code never stands in for the code now.
const without = (kinds: CheckKind[], gone: Iterable<CheckKind>) => {
  const drop = new Set(gone);
  return kinds.filter((k) => !drop.has(k));
};

// A check ran. A pass is evidence for the worktree it started on, per kind; a failure wipes
// earlier evidence (a later lint pass must not stand in for failing tests). A failure before the
// task's first edit is its baseline: the same failure later (same `output` hash) opens nothing.
export function onCheck(
  task: Task,
  passed: boolean,
  startedAt: number,
  startPrint: string | undefined,
  checked: CheckKind | readonly CheckKind[],
  output?: string,
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
    const hash = output === undefined ? undefined : failureHash(output);
    const baseline = { ...task.baseline };
    const same: CheckKind[] = []; // failures that were already there
    const isNew: CheckKind[] = [];
    for (const k of kinds) {
      if (hash !== undefined && baseline[k] === hash) same.push(k);
      else if (
        hash !== undefined &&
        kinds.length === 1 && // a compound run's output does not say which kind failed
        baseline[k] === undefined &&
        pristine(task, startPrint)
      ) {
        baseline[k] = hash;
        same.push(k);
      } else isNew.push(k);
    }
    // The kind ran on this code and showed nothing new: that counts as its run.
    const passedPrints = { ...task.passedPrints };
    const passedAt = { ...task.passedAt };
    for (const k of same) {
      if (startPrint !== undefined) passedPrints[k] = startPrint;
      passedAt[k] = startedAt;
    }
    const stillOpen = without(task.openKinds ?? [], same);
    if (!isNew.length)
      return {
        ...task,
        baseline,
        passedPrints,
        passedAt,
        openKinds: stillOpen,
        ...(!stillOpen.length
          ? { lastCheckAt: startedAt, checkedPrint: startPrint }
          : {}),
      };
    for (const k of isNew) failedAt[k] = Math.max(failedAt[k] ?? 0, startedAt);
    return {
      ...task,
      baseline,
      passedPrints,
      passedAt,
      openKinds: [...new Set([...stillOpen, ...isNew])],
      closedKinds: without(task.closedKinds ?? [], isNew),
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
  const passedPrints = { ...task.passedPrints };
  const passedAt = { ...task.passedAt };
  const baseline = { ...task.baseline };
  for (const k of kinds) {
    // a pass git could not fingerprint must not inherit an older print (e.g. a baseline run's)
    if (startPrint !== undefined) passedPrints[k] = startPrint;
    else delete passedPrints[k];
    passedAt[k] = startedAt;
    delete baseline[k];
  }
  return {
    ...task,
    openKinds,
    closedPrints,
    passedPrints,
    passedAt,
    baseline,
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
