import { expect, test } from "claude-code/testing";

import {
  checkKindOfArgv,
  checkOf,
  checkPassed,
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
