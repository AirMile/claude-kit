import { expect, test } from "claude-code/testing";
import { measure, resume, typed, world } from "./limit-queue-fixture";

for (const arg of ["", "status", "off", "warm", "pause", "resume", "bad"])
  test(`/limit ${arg} answers in text`, async ($, on) => {
    const w = world(on);
    const r = await $.command.run({ command: "limit", args: arg } as never);
    expect(typeof r.text).toBe("string");
    if (arg === "off" || arg === "warm" || arg === "pause")
      expect(w.store.limitHold).toEqual({ s1: arg });
    if (arg === "pause") expect(r.text ?? "").toContain("near the 5-hour limit");
    if (arg === "resume") expect(r.text ?? "").toContain("nothing to resume");
    if (arg === "bad") expect(r.text ?? "").toContain("/limit [status|off|warm|pause|resume]");
    if (!arg || arg === "status") expect(r.text ?? "").toContain("Limit");
  });

test("/limit resume answers without waiting for a stuck replay", async ($, on) => {
  const w = world(on);
  w.state.hangPrompt = true;
  await $.session.measure(measure());
  await $.prompt.submit(typed());
  const r = await $.command.run(resume);
  expect(r.text ?? "").toContain("resuming");
  expect((await $.command.run({ command: "limit", args: "off" } as never)).text ?? "").toContain("Off");
  expect(w.store.limitHold).toEqual({ s1: "off" });
});

test("refusing /limit registration cannot skip session start", async ($, on) => {
  const w = world(on);
  const registered: string[] = [];
  let spec: unknown;
  on("session.start", async (_$, e) => ({ cwd: e.cwd }));
  on("tool.register", async () => ({ value: undefined }));
  on("command.register", async (_$, e) => {
    registered.push(e.name);
    if (e.name === "limit") { spec = e; throw new Error("registration refused"); }
    return { value: undefined };
  });
  await $.session.start({ cwd: "/p/app", surface: null, isInteractive: false });
  expect(spec).toEqual({ name: "limit", description: "Control kit's plan-limit pause and keep warm",
    argumentHint: "[status|off|warm|pause|resume]", immediate: true });
  expect(registered.includes("kitcompact")).toBe(true);
  expect(w.toasts.some((t) => t.includes("/limit") && t.includes("could not register"))).toBe(true);
});
