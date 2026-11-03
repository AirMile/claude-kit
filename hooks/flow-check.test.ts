import { expect, test } from "claude-code/testing";

import { checkOf, checkPassed, hashText } from "./flow-check";

test("only real check runs count; a piped check passes only without failure words", async () => {
  expect(checkOf("npm test")).toEqual({ piped: false });
  expect(checkOf("cd app && pnpm run typecheck")).toEqual({ piped: false });
  expect(checkOf("npx -y -p typescript@5.6.3 tsc --noEmit -p .")).toBeTruthy();
  expect(checkOf("claude plugin test . 2>&1 | tail -3")).toEqual({
    piped: true,
  });
  expect(checkOf("CI=1 vitest run src/a.test.ts")).toBeTruthy();
  expect(checkOf("echo test")).toBe(undefined);
  expect(checkOf("cat src/foo.test.ts")).toBe(undefined);
  expect(checkOf("git commit -m 'test'")).toBe(undefined);
  expect(
    checkPassed({ piped: true }, false, "Tests: 2 failed, 10 passed"),
  ).toBe(false);
  expect(checkPassed({ piped: true }, false, " 0 fail\n 95 pass")).toBe(true);
  expect(checkPassed({ piped: false }, true, "")).toBe(false);
  expect(hashText("a")).not.toBe(hashText("b"));
});
