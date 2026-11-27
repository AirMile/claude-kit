import { expect, test } from "claude-code/testing";
import { measure, resume, typed, world } from "./limit-queue-fixture";

for (const name of ["kit:commit", "my-prompt", "simplify"])
  test(`${name} is kept and replayed as a command, including a bundled skill`, async ($, on) => {
    const w = world(on);
    await $.session.measure(measure());
    const r = await $.prompt.submit({ ...typed(`/${name} the diff`), command: { name, args: "the diff" } } as never);
    expect(r.drop ?? "").toContain("sent at");
    expect(w.commands).toEqual([]);
    await $.command.run(resume);
    await w.runs();
    expect(w.commands).toEqual([{ command: name, args: "the diff" }]);
    expect(w.entered).toEqual([]);
  });

for (const name of ["compact", "unknown"])
  test(`${name} is not queued as a skill and says its existing effects stand`, async ($, on) => {
    const w = world(on);
    await $.session.measure(measure());
    const r = await $.prompt.submit({ ...typed(`/${name}`), command: { name, args: "" } } as never);
    expect(r.drop ?? "").toContain("built in");
    expect(r.drop ?? "").toContain("not sent again");
    expect(r.drop ?? "").toContain("already did stands");
    expect((await $.command.run(resume)).text ?? "").toContain("nothing was kept");
  });

test("a failed command lookup does not queue a command", async ($, on) => {
  const w = world(on); w.state.listFails = true;
  await $.session.measure(measure());
  const r = await $.prompt.submit({ ...typed("/kit:commit"), command: { name: "kit:commit", args: "" } } as never);
  expect(r.drop ?? "").toContain("not sent again");
  expect((await $.command.run(resume)).text ?? "").toContain("nothing was kept");
});

test("a local command passes untouched during a pause", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure());
  expect((await $.command.run({ command: "mode", args: "off" } as never)).text).toBe("kit profile: Off.");
  expect((await $.command.run({ command: "limit", args: "" } as never)).text ?? "").toContain("paused until");
  expect(w.entered).toEqual([]);
});

for (const kind of ["composer", "bridge", "sdk", "peer", "task-notification", "plugin", "unclassified"] as const)
  test(`a held ${kind} prompt keeps its provenance when replayed`, async ($, on) => {
    const w = world(on);
    await $.session.measure(measure());
    await $.prompt.submit({ ...typed(), origin: kind === "plugin"
      ? { kind, name: "other", asUser: true } : { kind } } as never);
    await $.command.run(resume);
    await w.arrives();
    const own = ["composer", "bridge", "sdk", "plugin"].includes(kind);
    expect(w.entered[0]?.origin).toEqual({ kind: "plugin", name: "kit", ...(own ? { asUser: true } : {}) });
  });

test("attachments are explicitly not kept", async ($, on) => {
  world(on);
  await $.session.measure(measure());
  const r = await $.prompt.submit({ ...typed(), attachments: [{ type: "image" }] } as never);
  expect(r.drop ?? "").toContain("attachments are not kept");
});

test("a command's downstream prompt drop keeps it for retry", async ($, on) => {
  const w = world(on); w.state.blockCommand = true;
  await $.session.measure(measure());
  await $.prompt.submit({ ...typed("/kit:commit"), command: { name: "kit:commit", args: "" } } as never);
  await $.command.run(resume); await w.runs();
  w.state.drop = true;
  await $.prompt.submit({ text: "/kit:commit", command: { name: "kit:commit", args: "" },
    origin: { kind: "plugin", name: "kit" } } as never);
  w.state.finish?.();
  await w.says("1 prompt still kept");
  expect((await $.command.run({ command: "limit", args: "" } as never)).text ?? "").toContain("1 kept, not sent");
  w.state.drop = false; w.state.blockCommand = false;
  await $.command.run(resume);
  await w.runs(2);
  expect(w.commands.length).toBe(2);
});

test("a pause returning during command replay never queues a duplicate", async ($, on) => {
  const w = world(on); w.state.blockCommand = true;
  await $.session.measure(measure());
  await $.prompt.submit({ ...typed("/kit:commit"), command: { name: "kit:commit", args: "" } } as never);
  await $.command.run(resume); await w.runs();
  await $.session.measure(measure());
  const r = await $.prompt.submit({ text: "/kit:commit", command: { name: "kit:commit", args: "" },
    origin: { kind: "plugin", name: "kit" } } as never);
  expect(r.drop ?? "").toContain("paused");
  w.state.finish?.(); await w.says("1 prompt still kept");
  expect((await $.command.run({ command: "limit", args: "" } as never)).text ?? "").toContain("1 queued");
});

test("leaving a chat while a command is in flight releases it without a late failure toast", async ($, on) => {
  const w = world(on); w.state.blockCommand = true;
  await $.session.measure(measure());
  await $.prompt.submit({ ...typed("/kit:commit"), command: { name: "kit:commit", args: "" } } as never);
  await $.command.run(resume); await w.runs();
  await $.session.end({ reason: "resume" } as never);
  w.state.reject = true; w.state.finish?.();
  expect((await $.command.run({ command: "limit", args: "" } as never)).text ?? "").toContain("0 kept");
  expect(w.toasts.some((t) => t.includes("1 kept prompt dropped"))).toBe(true);
  expect(w.toasts.some((t) => t.includes("not sent"))).toBe(false);
});

test("a plugin prompt without asUser keeps its plugin frame", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure());
  await $.prompt.submit({ ...typed(), origin: { kind: "plugin", name: "other" } } as never);
  await $.command.run(resume); await w.arrives();
  expect(w.entered[0]?.origin).toEqual({ kind: "plugin", name: "kit" });
});

test("a cut turn resumes once ahead of the kept prompts and never asUser", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure());
  for await (const _ of $.turn.step({ turnId: "t1", index: 0 } as never)) { /* drain */ }
  await $.prompt.submit(typed("after the cut"));
  const r = await $.command.run(resume);
  expect(r.text ?? "").toContain("resuming");
  await w.sentCount(2);
  expect(w.entered.map((e) => e.text)).toEqual([
    "kit: the plan limit has reset. Continue where you stopped before the pause.", "after the cut",
  ]);
  expect(w.entered[0]?.origin).toEqual({ kind: "plugin", name: "kit" });
  await $.command.run(resume);
  expect(w.entered.length).toBe(2);
});

// A text prompt kit sends never reaches kit's own hook (measured live); a command's does.
for (const turns of [0, 5])
  test(`a replayed command asks no model question after ${turns} turns`, async ($, on) => {
    const w = world(on); w.store.mode = "quality"; w.state.turns = turns; w.state.blockCommand = true;
    await $.session.measure(measure());
    const command = { name: "my-prompt", args: "refactor the auth layer" };
    await $.prompt.submit({ ...typed("/my-prompt refactor the auth layer"), command } as never);
    await $.command.run(resume); await w.runs();
    await $.prompt.submit({ text: "/my-prompt refactor the auth layer", command,
      origin: { kind: "plugin", name: "kit" } } as never);
    w.state.finish?.();
    expect(w.entered.length).toBe(1);
    expect(w.asked).toEqual([]);
    expect(w.store.switches).toBe(undefined);
  });

// The host refuses a plugin's prompt that starts with "/" (measured live): sent as it stood, it
// would block the queue for good.
test("a kept prompt that starts with a slash is replayed behind a first line", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure());
  await $.prompt.submit(typed("/tmp/file.txt has the log"));
  await $.command.run(resume); await w.arrives();
  expect(w.entered[0]?.text).toBe("Kept prompt:\n/tmp/file.txt has the log");
});

const status = { command: "limit", args: "" } as never;
const held = (name: string) =>
  ({ ...typed(`/${name}`), command: { name, args: "" } }) as never;

test("a built-in prompt command the skill listing leaves out is kept", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure());
  const r = await $.prompt.submit(held("debug"));
  expect(r.drop ?? "").toContain("sent at");
  expect((await $.command.run(status)).text ?? "").toContain("1 queued");
});

// A forked command raises no prompt.submit: the pause cuts its subagent, so kit keeps it there.
test("a forked command cut by the pause is kept and replayed", async ($, on) => {
  const w = world(on);
  const fork = async () => {
    for await (const _ of $.turn.step({ turnId: "f", index: 0, agentId: "a1" } as never)) { /* cut */ }
  };
  await $.session.measure(measure());
  w.state.during = fork;
  await $.command.run({ command: "code-review", args: "high" } as never);
  expect((await $.command.run(status)).text ?? "").toContain("1 queued");
  expect(w.toasts.some((t) => t.includes("/code-review") && t.includes("kept"))).toBe(true);
  w.state.during = undefined;
  await $.command.run(resume); await w.runs(2);
  expect(w.commands[1]).toEqual({ command: "code-review", args: "high" });
  expect(w.entered).toEqual([]); // no "continue" prompt: only the fork was cut
});

test("a replayed fork that a new pause cuts stays kept", async ($, on) => {
  const w = world(on);
  const fork = async () => {
    for await (const _ of $.turn.step({ turnId: "f", index: 0, agentId: "a1" } as never)) { /* cut */ }
  };
  await $.session.measure(measure());
  w.state.during = fork;
  await $.command.run({ command: "code-review", args: "" } as never);
  w.state.during = async () => { await $.session.measure(measure()); await fork(); };
  await $.command.run(resume);
  await w.says("1 prompt still kept");
  expect((await $.command.run(status)).text ?? "").toContain("1 queued");
  w.state.during = undefined;
  await $.command.run(resume); await w.runs(3);
  expect(w.entered).toEqual([]);
});

// A background subagent raised agent.spawn, a forked command's loop raises none.
for (const command of ["compact", "other:local"])
  test(`the local command ${command} run while a background subagent is cut is not kept`, async ($, on) => {
    const w = world(on);
    await $.agent.spawn({ prompt: "look", subagentType: "general-purpose" } as never);
    await $.session.measure(measure());
    w.state.during = async () => {
      for await (const _ of $.turn.step({ turnId: "b", index: 0, agentId: "bg" } as never)) { /* cut */ }
    };
    await $.command.run({ command, args: "" } as never);
    expect((await $.command.run(status)).text ?? "").toContain("0 kept");
    expect(w.toasts.some((t) => t.includes(`/${command}`))).toBe(false);
    await $.command.run(resume); await w.arrives();
    expect(w.entered[0]?.text).toContain("Continue where you stopped"); // the subagent was cut
  });

test("a pause that starts during a forked command sends no continue prompt", async ($, on) => {
  const w = world(on);
  w.state.during = async () => {
    await $.session.measure(measure());
    for await (const _ of $.turn.step({ turnId: "f", index: 0, agentId: "a1" } as never)) { /* cut */ }
  };
  await $.command.run({ command: "code-review", args: "" } as never);
  w.state.during = undefined;
  await $.command.run(resume); await w.runs(2);
  expect(w.entered).toEqual([]);
});

test("a cut fork that cannot be identified is said not to be kept", async ($, on) => {
  const w = world(on); w.state.listFails = true;
  await $.session.measure(measure());
  w.state.during = async () => {
    for await (const _ of $.turn.step({ turnId: "f", index: 0, agentId: "a1" } as never)) { /* cut */ }
  };
  await $.command.run({ command: "code-review", args: "" } as never);
  expect(w.toasts.some((t) => t.includes("/code-review") && t.includes("not kept"))).toBe(true);
});

test("a command on its way when its chat was left is refused", async ($, on) => {
  const w = world(on); w.state.blockCommand = true;
  await $.session.measure(measure());
  await $.prompt.submit(held("kit:commit"));
  await $.command.run(resume); await w.runs();
  await $.session.end({ reason: "resume" } as never);
  const r = await $.prompt.submit({ text: "/kit:commit", command: { name: "kit:commit", args: "" },
    origin: { kind: "plugin", name: "kit" } } as never);
  w.state.finish?.();
  expect(r.drop ?? "").toContain("dropped with the chat");
  expect(w.entered).toEqual([]);
});

test("a pause that ends while a command is looked up lets it through", async ($, on) => {
  const w = world(on);
  let release = () => {};
  w.state.lookup = new Promise<void>((done) => (release = done));
  const looking = new Promise<void>((done) => (w.state.looking = done));
  await $.session.measure(measure());
  const submitting = $.prompt.submit(held("kit:commit"));
  await looking;
  await $.command.run({ command: "limit", args: "off" } as never);
  release();
  expect((await submitting).drop).toBe(undefined);
  expect((await $.command.run(status)).text ?? "").toContain("0 kept");
});

test("/limit acts on the chat it is typed in, also after a clear", async ($, on) => {
  const w = world(on);
  await $.command.run(status);
  await $.session.end({ reason: "clear" } as never);
  w.state.session = "s2";
  const r = await $.command.run({ command: "limit", args: "pause" } as never);
  expect(r.text ?? "").toContain("Limit");
  expect(w.store.limitHold).toEqual({ s1: "pause", s2: "pause" });
});

test("/limit resume says a send is already under way", async ($, on) => {
  const w = world(on); w.state.blockCommand = true;
  await $.session.measure(measure());
  await $.prompt.submit(held("kit:commit"));
  await $.command.run(resume); await w.runs();
  expect((await $.command.run(resume)).text ?? "").toContain("already under way");
});

test("/limit off after a cut turn says it sends the continue prompt", async ($, on) => {
  const w = world(on);
  await $.session.measure(measure());
  for await (const _ of $.turn.step({ turnId: "t1", index: 0 } as never)) { /* cut */ }
  const r = await $.command.run({ command: "limit", args: "off" } as never);
  expect(r.text ?? "").toContain("sending the continue prompt");
});

test("a refused continue prompt counts as kept", async ($, on) => {
  const w = world(on); w.state.drop = true;
  await $.session.measure(measure());
  for await (const _ of $.turn.step({ turnId: "t1", index: 0 } as never)) { /* cut */ }
  await $.command.run(resume);
  await w.says("1 prompt still kept");
  expect((await $.command.run(status)).text ?? "").toContain("1 kept, not sent");
});

test("/limit resume ends a pause that returned while a send is under way", async ($, on) => {
  const w = world(on); w.state.blockCommand = true;
  await $.session.measure(measure());
  await $.prompt.submit(held("kit:commit"));
  await $.command.run(resume); await w.runs();
  await $.session.measure(measure());
  await $.command.run(resume);
  expect((await $.command.run(status)).text ?? "").not.toContain("paused until");
});

