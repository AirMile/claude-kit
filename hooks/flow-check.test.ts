import { expect, test } from "claude-code/testing";

import {
  checkKindOfArgv,
  checkOf,
  checkPassed,
  checkSettled,
  withoutStatus,
  hashText,
  isCheckArgv,
} from "./flow-check";

test("detect-tools commands share their kinds in shell and argv checks", async () => {
  const commands = [
    ["vendor/bin/phpunit", "test"],
    ["./vendor/bin/phpstan analyse", "static"],
    ["vendor/bin/psalm", "static"],
    ["vendor/bin/phpcs", "static"],
    ["dotnet test App.sln", "test"],
    ["dotnet format App.sln --verify-no-changes", "static"],
    ["dotnet build App.sln", "build"],
    ["mvn test", "test"],
    ["mvn -DskipTests package", "build"],
    ["mvn checkstyle:check", "static"],
    ["./gradlew test", "test"],
    ["./gradlew assemble", "build"],
    ["./gradlew detekt", "static"],
    ["gradle test", "test"],
    ["uv run pytest", "test"],
    ["uv run ruff check .", "static"],
    ["uv run mypy .", "static"],
    ["pyright", "static"],
    ["go test ./...", "test"],
    ["go vet ./...", "static"],
    ["golangci-lint run", "static"],
    ["go build ./...", "build"],
    ["cargo test", "test"],
    ["cargo clippy --all-targets -- -D warnings", "static"],
    ["cargo build", "build"],
    ["npx ng test --watch=false", "test"],
    ["npx ng lint", "static"],
    ["npx ng build", "build"],
    ["pnpm exec vitest run", "test"],
    ["npx biome check .", "static"],
    ["npx tsc --noEmit", "static"],
  ] as const;
  for (const [command, kind] of commands) {
    expect(checkOf(command)).toEqual({ piped: false, kind, kinds: [kind] });
    expect(checkKindOfArgv(command.split(" "))).toBe(kind);
  }
  for (const [command, kind] of [
    ["node_modules/.bin/vitest run", "test"],
    ["mvn package", "build"],
    ["mvn -DskipTests -Dprofile=ci package", "build"],
    ["mvn spotbugs:check", "static"],
    ...["gradle", "./gradlew"].flatMap((runner) =>
      ["detekt", "checkstyleMain", "ktlintCheck"].map((task) => [
        `${runner} ${task}`,
        "static",
      ]),
    ),
  ]) {
    expect(checkOf(command)).toEqual({ piped: false, kind, kinds: [kind] });
    expect(checkKindOfArgv(command.split(" "))).toBe(kind);
  }
  for (const command of ["echo test", "cat x.test.ts"]) {
    expect(checkOf(command)).toBe(undefined);
    expect(checkKindOfArgv(command.split(" "))).toBe(undefined);
  }
});

test("only real check runs count; a piped check passes only without failure words", async () => {
  expect(checkOf("npm test")).toEqual({ piped: false, kind: "test", kinds: ["test"] });
  expect(checkOf("cd app && pnpm run typecheck")).toEqual({
    piped: false,
    kind: "static",
    kinds: ["static"],
  });
  expect(checkOf("npx -y -p typescript@5.6.3 tsc --noEmit -p .")).toBeTruthy();
  expect(checkOf("claude plugin test . 2>&1 | tail -3")).toEqual({
    piped: true,
    kind: "test",
    kinds: ["test"],
  });
  expect(checkOf("CI=1 vitest run src/a.test.ts")).toBeTruthy();
  expect(checkOf("echo test")).toBe(undefined);
  expect(checkOf("cat src/foo.test.ts")).toBe(undefined);
  expect(checkOf("git commit -m 'test'")).toBe(undefined);
  expect(
    checkPassed(
      { piped: true, kind: "test", kinds: ["test"] },
      false,
      "Tests: 2 failed, 10 passed",
    ),
  ).toBe(false);
  expect(
    checkPassed({ piped: true, kind: "test", kinds: ["test"] }, false, " 0 fail\n 95 pass"),
  ).toBe(true);
  expect(checkPassed({ piped: false, kind: "test", kinds: ["test"] }, true, "")).toBe(false);
  expect(hashText("a")).not.toBe(hashText("b"));
});

test("every runner has a kind, shared by shell and argv checks", async () => {
  const runners = {
    test: [
      "vitest run",
      "jest",
      "mocha",
      "ava",
      "pytest",
      "phpunit",
      "rspec",
      "playwright test",
      "cypress run",
      "bun test",
      "cargo test",
      "go test",
      "deno test",
      "make test",
      "dotnet test",
      "mvn test",
      "mvn verify",
      "gradle test",
      "./gradlew check",
      "swift test",
      "python -m pytest",
      "python3 -m unittest",
      "claude plugin test .",
      "node src/x.test.mjs",
      "ng test",
    ],
    static: [
      "tsc",
      "vue-tsc",
      "eslint",
      "biome",
      "ruff",
      "mypy",
      "pyright",
      "cargo check",
      "cargo clippy",
      "go vet",
      "deno check",
      "deno lint",
      "make check",
      "make lint",
      "python -m mypy",
      "ng lint",
      "phpstan",
      "psalm",
      "golangci-lint run",
      "staticcheck ./...",
    ],
    build: [
      "cargo build",
      "go build",
      "gradlew build",
      "ng build",
      "dotnet build",
      "mvn compile",
    ],
  } as const;
  for (const kind of ["test", "static", "build"] as const)
    for (const command of runners[kind]) {
      expect(checkOf(command)).toEqual({ piped: false, kind, kinds: [kind] });
      expect(checkKindOfArgv(command.split(" "))).toBe(kind);
      expect(isCheckArgv(command.split(" "))).toBe(true);
    }
  for (const runner of ["npm", "pnpm", "yarn", "bun"])
    for (const run of ["", "run "])
      for (const suffix of ["", ":ci"])
        for (const [name, kind] of [
          ["test", "test"],
          ["verify", "test"],
          ["check", "static"],
          ["lint", "static"],
          ["typecheck", "static"],
          ["type-check", "static"],
          ["build", "build"],
        ]) {
          const command = `${runner} ${run}${name}${suffix}`;
          expect(checkOf(command)?.kind).toBe(kind);
          expect(checkKindOfArgv(command.split(" "))).toBe(kind);
        }
});

test("prefixes, boundaries and first matching check keep their behaviour", async () => {
  for (const prefix of [
    "CI=1 time ",
    "npx -y ",
    "pnpm exec ",
    "yarn dlx ",
    "bunx ",
    "pnpx ",
    "uv run ",
    "poetry run ",
  ])
    expect(checkOf(`${prefix}pytest`)).toEqual({ piped: false, kind: "test", kinds: ["test"] });
  expect(checkOf("npm run lint && npm test")?.kind).toBe("static");
  expect(checkOf("npm run lint && npm test")?.kinds).toEqual(["static", "test"]);
  expect(checkOf("gradle build test")?.kind).toBe("build");
  expect(checkOf("cd app; ng test | tail -3")).toEqual({
    piped: true,
    kind: "test",
    kinds: ["test"],
  });
  for (const command of [
    "echo test",
    "cat x.test.ts",
    "ng tester",
    "tsconfig",
    "vitest-extra",
    "echo x; vitest",
  ])
    expect(checkKindOfArgv(command.split(" "))).toBe(undefined);
  expect(isCheckArgv(["echo", "x; vitest"])).toBe(false);
  expect(checkOf("cat x.test.ts")).toBe(undefined);
});

test("bare yarn binaries and compound && commands", async () => {
  for (const [command, kind] of [
    ["yarn vitest run", "test"],
    ["yarn jest", "test"],
    ["yarn biome check .", "static"],
    ["yarn eslint .", "static"],
    ["yarn tsc --noEmit", "static"],
    ["yarn test", "test"],
    ["yarn build", "build"],
  ] as const) {
    expect(checkOf(command)?.kind).toBe(kind);
    expect(checkKindOfArgv(command.split(" "))).toBe(kind);
  }
  for (const command of ["yarn add jest", "yarn install", "yarn"])
    expect(checkOf(command)).toBe(undefined);
  expect(checkOf("npm run lint && npm test && npm run build")?.kinds).toEqual([
    "static",
    "test",
    "build",
  ]);
  expect(checkOf("npm run lint; npm test")?.kinds).toEqual(["static"]);
  expect(checkOf("npm run lint || npm test")?.kinds).toEqual(["static"]);
  expect(checkOf("npm test || true")?.kinds).toEqual(["test"]);
  expect(checkOf("npm run lint && npm test | tail -3")?.piped).toBe(true);
});

test("Node's built-in runner is a test check; commands that only mention it are not", async () => {
  for (const command of [
    "node --test",
    "node --test test/*.test.mjs",
    "node --experimental-test-coverage --test x",
    "node --import ./setup.mjs --test x",
    "node --require ./setup.cjs --test x",
    "node -r ./setup.cjs --test x",
    "NODE_ENV=x node --test",
    "cd x && node --test test/*.test.mjs > f.log 2>&1",
  ]) {
    expect(checkOf(command)?.kind, command).toBe("test");
    expect(checkOf(command)?.masked, command).toBe(undefined);
  }
  expect(checkKindOfArgv(["node", "--test", "test/a.test.mjs"])).toBe("test");
  for (const command of [
    "node --version",
    "echo node --test",
    'node -e "1"',
    "node --eval 1 --test",
    "node -p 1",
    "node --print 1 --test",
    "node --test-only",
    "node --test-reporter=spec",
    "node --testing",
  ])
    expect(checkOf(command), command).toBe(undefined);
});

test("a masked exit status never credits a pass", async () => {
  const echoed = checkOf("node --test > f.log 2>&1; echo exit=$?");
  expect(echoed).toMatchObject({ kind: "test", status: "exit" });
  expect(echoed?.masked).toBe(undefined);
  expect(checkOf("node --test; echo $?")).toMatchObject({ status: "" });
  expect(checkOf("true || node --test")?.masked).toBe(true);
  expect(checkOf("node --test || true")?.masked).toBe(true);
  expect(checkOf("node --test; true")?.masked).toBe(true);
  expect(checkOf("node --test; echo done")?.masked).toBe(true);
  expect(checkOf("true || node --test; echo $?")?.masked).toBe(true);
  expect(checkOf("node --test > f.log 2>&1")?.masked).toBe(undefined);
  const settled = (c: string, error: boolean, out: string) =>
    checkSettled(checkOf(c)!, error, out);
  const word = "node --test > f.log 2>&1; echo exit=$?";
  expect(settled(word, false, "exit=0\n")).toBe(true);
  expect(settled(word, false, "some log\nexit=0")).toBe(true);
  expect(settled(word, false, "exit=1\n")).toBe(false);
  expect(settled(word, false, "")).toBe(undefined);
  expect(settled("node --test; echo $?", false, "0\n")).toBe(true);
  expect(settled("node --test; echo $?", false, "2\n")).toBe(false);
  expect(settled("true || node --test", false, "")).toBe(undefined);
  expect(settled("node --test || true", false, "")).toBe(undefined);
  expect(settled("node --test > f.log 2>&1", false, "")).toBe(true);
  expect(settled("node --test > f.log 2>&1", true, "")).toBe(false);
  expect(checkPassed(checkOf("true || node --test")!, false, "")).toBe(false);
  expect(checkPassed(checkOf(word)!, false, "exit=0")).toBe(true);
});

test("separators anywhere after the check, quotes, comments, pipes and node info flags", async () => {
  for (const command of [
    "node --test x && true || true",
    "node --test x && true; true",
    "node --test x\ntrue",
    "node --test x | tee y; echo $?",
    "npm test | tee x; echo $?",
    "true || x && node --test",
  ])
    expect(checkOf(command)?.masked, command).toBe(true);
  for (const command of [
    "echo 'before && node --test && after'",
    'echo "a; node --test"',
    "true # ignored && node --test",
    "node --version --test",
    "node --help --test",
  ])
    expect(checkOf(command), command).toBe(undefined);
  expect(checkOf("node --test x && echo ok")?.masked).toBe(undefined);
  expect(checkOf(`node ${"--import=x ".repeat(30)}--foo`)).toBe(undefined);
  const check = checkOf("node --test > f.log; echo FAIL=$?")!;
  expect(withoutStatus(check, "FAIL=1\n")).toBe("");
  expect(withoutStatus(check, "log line\nFAIL=1")).toBe("log line");
});
