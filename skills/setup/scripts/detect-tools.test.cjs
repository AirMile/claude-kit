#!/usr/bin/env node
/**
 * Tests for the read-only detector and formatter in detect-tools.js.
 * Usage: node skills/setup/scripts/detect-tools.test.cjs
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { detect, format } = require("./detect-tools.js");

function fixture(files, check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-detect-tools-"));
  try {
    for (const [name, contents] of Object.entries(files)) {
      const target = path.join(dir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
    check(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const pkg = (value) => JSON.stringify(value);
const block = (ecosystem, lines, rel = ".") => ({ ecosystem, rel, lines });
function expect(files, ecosystem, lines, title) {
  test(title || `${ecosystem}: ${Object.keys(files).join(", ")}`, () => {
    fixture(files, (dir) => {
      assert.deepStrictEqual(detect(dir), [block(ecosystem, lines)]);
      assert.deepStrictEqual(detect(dir), detect(dir), "stable ordering");
    });
  });
}

expect(
  {
    "package.json": pkg({
      scripts: { test: "test", lint: "lint", typecheck: "tsc", build: "build" },
      devDependencies: { fallow: "*", knip: "*", eslint: "*" },
    }),
    "package-lock.json": "{}",
  },
  "JS/TS",
  [
    "Test: `npm test`",
    "Lint / typecheck: `npm run lint` · `npm run typecheck`",
    "Build: `npm run build`",
    "Security: `npm audit --omit=dev --audit-level=high`",
    "Quality: `npx fallow dead-code` · `npx knip`",
  ],
);

expect(
  {
    "package.json": pkg({
      dependencies: {
        vitest: "*",
        "@biomejs/biome": "*",
        eslint: "*",
        typescript: "*",
      },
      scripts: { build: "build" },
    }),
    "pnpm-lock.yaml": "",
    "tsconfig.json": "{}",
  },
  "JS/TS",
  [
    "Test: `pnpm exec vitest run`",
    "Lint / typecheck: `pnpm exec biome check .` · `pnpm exec eslint .` · `pnpm exec tsc --noEmit`",
    "Build: `pnpm run build`",
    "Security: `pnpm audit --prod --audit-level high`",
  ],
);

expect(
  {
    "package.json": pkg({
      scripts: { check: "check", "type-check": "tsc" },
      devDependencies: { jest: "*", eslint: "*", typescript: "*" },
    }),
    "tsconfig.json": "{}",
  },
  "JS/TS",
  [
    "Test: `npx jest`",
    "Lint / typecheck: `npm run check` · `npm run type-check`",
  ],
);

for (const [lock, run, exec, test] of [
  ["yarn.lock", "yarn", "yarn", "yarn test"],
  ["bun.lock", "bun run", "bunx", "bun run test"],
  ["bun.lockb", "bun run", "bunx", "bun run test"],
]) {
  expect(
    {
      "package.json": pkg({
        scripts: { test: "test", lint: "lint", build: "build" },
        devDependencies: { knip: "*" },
      }),
      [lock]: "",
    },
    "JS/TS",
    [
      `Test: \`${test}\``,
      `Lint / typecheck: \`${run} lint\``,
      `Build: \`${run} build\``,
      `Quality: \`${exec} knip\``,
    ],
  );
}

expect(
  {
    "package.json": pkg({ scripts: { test: "test" } }),
    "npm-shrinkwrap.json": "{}",
  },
  "JS/TS",
  ["Test: `npm test`", "Security: `npm audit --omit=dev --audit-level=high`"],
);

expect(
  {
    "package.json": pkg({
      devDependencies: { "@angular-eslint/builder": "*", typescript: "*" },
    }),
    "angular.json": "{}",
    "tsconfig.json": "{}",
    "pnpm-lock.yaml": "",
  },
  "Angular",
  [
    "Test: `npx ng test --watch=false`",
    "Lint / typecheck: `npx ng lint` · `pnpm exec tsc --noEmit`",
    "Build: `npx ng build`",
    "Security: `pnpm audit --prod --audit-level high`",
  ],
);

expect(
  {
    "package.json": pkg({
      scripts: { test: "test", lint: "lint", build: "build" },
      devDependencies: { eslint: "*" },
    }),
    "angular.json": "{}",
  },
  "Angular",
  [
    "Test: `npm test`",
    "Lint / typecheck: `npm run lint`",
    "Build: `npm run build`",
  ],
);

expect(
  {
    "pyproject.toml":
      '[project]\ndependencies = ["pytest>=8", "pip-audit", "bandit"]\n[tool.ruff.lint]\n[tool.mypy]\n',
    "requirements-dev.txt": "pyright>=1\nvulture\n# pytest-not-a-tool\n",
    "uv.lock": "",
  },
  "Python",
  [
    "Test: `uv run pytest`",
    "Lint / typecheck: `uv run ruff check .` · `uv run mypy .` · `uv run pyright`",
    "Security: `uv run pip-audit` · `uv run bandit -r .`",
    "Quality: `uv run vulture .`",
  ],
);

expect(
  {
    "pyproject.toml": '[tool.poetry.group.dev.dependencies]\npytest = "*"\n',
    "poetry.lock": "",
  },
  "Python",
  ["Test: `poetry run pytest`"],
);
expect({ "requirements.txt": "pytest==8\nruff\n" }, "Python", [
  "Test: `pytest`",
  "Lint / typecheck: `ruff check .`",
]);

expect({ "go.mod": "module example.test/app", ".golangci.yaml": "" }, "Go", [
  "Test: `go test ./...`",
  "Lint / typecheck: `go vet ./...` · `golangci-lint run`",
  "Build: `go build ./...`",
]);

expect(
  {
    "Cargo.toml": "[workspace.metadata.cargo-machete]",
    "deny.toml": "",
    ".cargo/audit.toml": "",
  },
  "Rust",
  [
    "Test: `cargo test`",
    "Lint / typecheck: `cargo clippy --all-targets -- -D warnings`",
    "Build: `cargo build`",
    "Security: `cargo deny check` · `cargo audit`",
    "Quality: `cargo machete`",
  ],
);

expect(
  {
    "pom.xml":
      "<plugins>maven-checkstyle-plugin spotbugs-maven-plugin dependency-check-maven</plugins>",
  },
  "Java/Kotlin (Maven)",
  [
    "Test: `mvn test`",
    "Lint / typecheck: `mvn checkstyle:check` · `mvn spotbugs:check`",
    "Build: `mvn -DskipTests package`",
    "Security: `mvn org.owasp:dependency-check-maven:check`",
  ],
);

expect(
  {
    "build.gradle.kts":
      'plugins { id("detekt"); id("checkstyle"); id("ktlint") }',
    "settings.gradle.kts": 'plugins { id("org.owasp.dependencycheck") }',
    gradlew: "",
  },
  "Java/Kotlin (Gradle)",
  [
    "Test: `./gradlew test`",
    "Lint / typecheck: `./gradlew detekt` · `./gradlew checkstyleMain` · `./gradlew ktlintCheck`",
    "Build: `./gradlew assemble`",
    "Security: `./gradlew dependencyCheckAnalyze`",
  ],
);

for (const name of ["app.sln", "app.csproj", "app.fsproj"]) {
  expect({ [name]: "" }, ".NET", [
    "Test: `dotnet test`",
    "Lint / typecheck: `dotnet format --verify-no-changes`",
    "Build: `dotnet build`",
    "Security: `dotnet list package --vulnerable --include-transitive`",
  ]);
}

const phpLines = [
  "Test: `vendor/bin/phpunit`",
  "Lint / typecheck: `vendor/bin/phpstan analyse` · `vendor/bin/psalm` · `vendor/bin/phpcs`",
  "Security: `composer audit`",
];
expect(
  {
    "composer.json": pkg({
      require: { "phpunit/phpunit": "*", "phpstan/phpstan": "*" },
      "require-dev": { "vimeo/psalm": "*", "squizlabs/php_codesniffer": "*" },
    }),
    "composer.lock": "{}",
  },
  "PHP",
  phpLines,
);
expect(
  {
    "composer.json": "{}",
    "phpunit.xml.dist": "",
    "phpstan.neon.dist": "",
    "psalm.xml": "",
    "phpcs.xml.dist": "",
    "composer.lock": "{}",
  },
  "PHP",
  phpLines,
);

for (const files of [
  {},
  { "README.md": "pytest eslint go test" },
  { "package.json": "{}", "tsconfig.json": "{}", "eslint.config.js": "" },
  { "package.json": "{broken", "package-lock.json": "{}" },
  { "package.json": "null" },
  {
    "pyproject.toml":
      '# pytest\n[project]\ndescription = "pytest"\n[tool.other]\nname = "ruff"\n',
    "requirements.txt": "# ruff\npytest-extra\n",
  },
  { "setup.py": "# pytest", "setup.cfg": "# ruff" },
  { "composer.json": "{}" },
]) {
  fixture(files, (dir) => {
    assert.deepStrictEqual(detect(dir), []);
    assert.strictEqual(format(detect(dir)), "");
  });
}

fixture(
  {
    "package.json": pkg({ scripts: { test: "test" } }),
    "backend/go.mod": "module example.test/backend",
    "backend/nested/Cargo.toml": "",
    ...Object.fromEntries(
      [
        "node_modules",
        ".git",
        "dist",
        "build",
        "vendor",
        "target",
        ".next",
        "__pycache__",
        ".hidden",
      ].map((dir) => [`${dir}/go.mod`, "module ignored"]),
    ),
  },
  (dir) => {
    const blocks = [
      block("JS/TS", ["Test: `npm test`"]),
      block(
        "Go",
        [
          "Test: `go test ./...`",
          "Lint / typecheck: `go vet ./...`",
          "Build: `go build ./...`",
        ],
        "backend",
      ),
    ];
    assert.deepStrictEqual(detect(dir), blocks);
    assert.strictEqual(
      format(blocks),
      [
        "## JS/TS · .",
        "Test: `npm test`",
        "",
        "## Go · backend",
        "Test: `go test ./...`",
        "Lint / typecheck: `go vet ./...`",
        "Build: `go build ./...`",
      ].join("\n"),
    );
  },
);

fixture(
  { "package.json": "{}", "go.mod": "module root", "Cargo.toml": "" },
  (dir) => {
    assert.deepStrictEqual(
      detect(dir).map(({ ecosystem }) => ecosystem),
      ["Go", "Rust"],
    );
  },
);
assert.strictEqual(format([]), "");

expect(
  { "package.json": "\uFEFF" + pkg({ scripts: { test: "vitest run" } }) },
  "JS/TS",
  ["Test: `npm test`"],
  "UTF-8 BOM package.json is parsed",
);
expect(
  { "composer.json": "\uFEFF" + pkg({ require: { "phpunit/phpunit": "*" } }) },
  "PHP",
  ["Test: `vendor/bin/phpunit`"],
  "UTF-8 BOM composer.json is parsed",
);

const stub = 'echo "Error: no test specified" && exit 1';
for (const runner of ["vitest", "jest"]) {
  expect(
    {
      "package.json": pkg({
        scripts: { test: stub },
        devDependencies: { [runner]: "*" },
      }),
    },
    "JS/TS",
    [`Test: \`npx ${runner === "vitest" ? "vitest run" : "jest"}\``],
    `npm-init stub falls back to ${runner}`,
  );
}
test("npm-init stub without a runner emits no Test line", () => {
  fixture({ "package.json": pkg({ scripts: { test: stub } }) }, (dir) => {
    assert.deepStrictEqual(detect(dir), []);
  });
});
for (const command of [
  "ng test",
  "npx ng test app",
  "ng test --watch=false",
  "ng test --watch true",
]) {
  expect(
    {
      "package.json": pkg({ scripts: { test: command } }),
      "angular.json": "{}",
    },
    "Angular",
    [
      `Test: \`${command.includes("--watch") ? "npm test" : command.trim() === "ng test" ? "npx ng test --watch=false" : "npm test -- --watch=false"}\``,
      "Build: `npx ng build`",
    ],
    `Angular handles watch mode: ${command}`,
  );
}

for (const name of ["lint", "check", "typecheck", "type-check"]) {
  for (const flag of ["--write", "--fix", "--apply", "--fix=true"]) {
    const typecheck = name.startsWith("type");
    expect(
      {
        "package.json": pkg({
          scripts: { [name]: `tool ${flag} .` },
          devDependencies: typecheck
            ? { typescript: "*" }
            : { "@biomejs/biome": "*", eslint: "*" },
        }),
        "tsconfig.json": "{}",
      },
      "JS/TS",
      [
        typecheck
          ? "Lint / typecheck: `npx tsc --noEmit`"
          : "Lint / typecheck: `npx biome check .` · `npx eslint .`",
      ],
      `${name} ${flag} falls back to read-only checks`,
    );
  }
  expect(
    { "package.json": pkg({ scripts: { [name]: "eslint --fix-dry-run ." } }) },
    "JS/TS",
    [`Lint / typecheck: \`npm run ${name}\``],
    `${name} --fix-dry-run remains read-only`,
  );
  test(`${name} with --fix and no dependencies is omitted`, () => {
    fixture(
      { "package.json": pkg({ scripts: { [name]: "tool --fix ." } }) },
      (dir) => {
        assert.deepStrictEqual(detect(dir), []);
      },
    );
  });
}
expect(
  {
    "package.json": pkg({
      scripts: { check: "biome check --write ." },
      devDependencies: { "@biomejs/biome": "*" },
    }),
  },
  "JS/TS",
  ["Lint / typecheck: `npx biome check .`"],
  "writing Biome check falls back without a lint script",
);
expect(
  {
    "package.json": pkg({
      scripts: { lint: "biome check .", check: "biome check --write ." },
    }),
  },
  "JS/TS",
  ["Lint / typecheck: `npm run lint`"],
  "read-only lint takes precedence over writing check",
);
expect(
  {
    "package.json": pkg({
      scripts: {
        lint: "eslint --fix .",
        check: "eslint .",
        typecheck: "tsc --write",
        "type-check": "tsc --noEmit",
      },
    }),
  },
  "JS/TS",
  ["Lint / typecheck: `npm run check` · `npm run type-check`"],
  "unsafe scripts fall through to safe alternative scripts",
);

expect(
  { "build.gradle": "detekt checkstyle ktlint org.owasp.dependencycheck" },
  "Java/Kotlin (Gradle)",
  [
    "Test: `gradle test`",
    "Lint / typecheck: `gradle detekt` · `gradle checkstyleMain` · `gradle ktlintCheck`",
    "Build: `gradle assemble`",
    "Security: `gradle dependencyCheckAnalyze`",
  ],
  "Gradle without a wrapper uses gradle for every command",
);
for (const project of ["App.csproj", "App.fsproj"]) {
  expect(
    { "App.sln": "", [project]: "", "Tests.csproj": "" },
    ".NET",
    [
      "Test: `dotnet test App.sln`",
      "Lint / typecheck: `dotnet format App.sln --verify-no-changes`",
      "Build: `dotnet build App.sln`",
      "Security: `dotnet list App.sln package --vulnerable --include-transitive`",
    ],
    `.NET selects the single solution alongside ${project}`,
  );
}
expect(
  { "App.csproj": "", "Tests.fsproj": "" },
  ".NET",
  [
    "Test: `dotnet test`",
    "Lint / typecheck: `dotnet format --verify-no-changes`",
    "Build: `dotnet build`",
    "Security: `dotnet list package --vulnerable --include-transitive`",
  ],
  ".NET with only projects keeps bare commands",
);

for (const [solution, target] of [
  ["App;echo INJECTED;.sln", ""],
  ["-app.sln", ""],
  ["--help.sln", ""],
  ["My App.sln", ' "My App.sln"'],
  ["App.sln", " App.sln"],
  ["App.slnx", " App.slnx"],
  ["My App.slnx", ' "My App.slnx"'],
  ...["&", "|", "$", "`", "(", ")", "<", ">", '"', "'", "\\", "!"]
    .filter(
      (character) =>
        process.platform !== "win32" || !/[<>"|\\]/.test(character),
    )
    .map((character) => [`App${character}unsafe.sln`, ""]),
]) {
  expect(
    { [solution]: "", "App.csproj": "" },
    ".NET",
    [
      `Test: \`dotnet test${target}\``,
      `Lint / typecheck: \`dotnet format${target} --verify-no-changes\``,
      `Build: \`dotnet build${target}\``,
      `Security: \`dotnet list${target} package --vulnerable --include-transitive\``,
    ],
    `.NET safely handles solution name: ${solution}`,
  );
}

test("other ecosystems never interpolate project filenames into commands", () => {
  const files = {
    "package.json": pkg({ scripts: { test: "vitest project.test.ts" } }),
    "requirements.txt": "pytest\nruff\n",
    "go.mod": "module example.test/app",
    "Cargo.toml": "",
    "pom.xml": "maven-checkstyle-plugin",
    "build.gradle": "detekt",
    "composer.json": pkg({ require: { "phpunit/phpunit": "*" } }),
  };
  fixture(files, (baseline) => {
    const renamed = { ...files };
    delete renamed["requirements.txt"];
    renamed["requirements;echo INJECTED;.txt"] = files["requirements.txt"];
    renamed["project;echo INJECTED;.test.ts"] = "";
    fixture(renamed, (dir) => {
      assert.deepStrictEqual(detect(dir), detect(baseline));
      assert.ok(!format(detect(dir)).includes("INJECTED"));
      assert.ok(!format(detect(dir)).includes("project.test.ts"));
    });
  });
});

for (const [lock, command, security] of [
  ["package-lock.json", "npm test", "npm audit --omit=dev --audit-level=high"],
  ["pnpm-lock.yaml", "pnpm test", "pnpm audit --prod --audit-level high"],
  ["yarn.lock", "yarn test", ""],
  ["bun.lock", "bun run test", ""],
]) {
  for (const script of [
    "ng test admin --configuration=ci --browsers=FirefoxHeadless",
    "ng test admin --configuration=ci --browsers=FirefoxHeadless --watch=false",
    "ng test admin --configuration=ci --browsers=FirefoxHeadless --no-watch",
    "  ng test  ",
  ]) {
    const expected =
      script.trim() === "ng test"
        ? "npx ng test --watch=false"
        : /--(?:watch|no-watch)/.test(script)
          ? command
          : command +
            (command.startsWith("npm") || command.startsWith("pnpm")
              ? " -- --watch=false"
              : " --watch=false");
    expect(
      {
        "package.json": pkg({ scripts: { test: script } }),
        "angular.json": "{}",
        [lock]: "",
      },
      "Angular",
      [
        `Test: \`${expected}\``,
        "Build: `npx ng build`",
        ...(security ? [`Security: \`${security}\``] : []),
      ],
      `Angular preserves script arguments using ${command}: ${script}`,
    );
  }
}
