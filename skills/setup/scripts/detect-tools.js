#!/usr/bin/env node
/**
 * Detect evidenced verification commands as fixed Markdown for AGENTS.md.
 * Reads only the project and its immediate, non-generated subdirectories.
 * Unknown projects print nothing and exit 0. No project command is executed; a Cargo project
 * only asks, from the home folder, whether the installed toolchain has rustfmt.
 *
 * Usage: node detect-tools.js [dir]
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SKIP = new Set([
  "node_modules",
  "dist",
  "build",
  "vendor",
  "target",
  "__pycache__",
]);

function entries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function read(file) {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return "";
  }
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function json(file) {
  try {
    const value = JSON.parse(read(file));
    return object(value) ? value : null;
  } catch {
    return null;
  }
}

/** Empty categories are omitted; command order is the ecosystem's rule order. */
function lines(test = [], lint = [], build = [], security = [], quality = []) {
  return [
    ["Test", test],
    ["Lint / typecheck", lint],
    ["Build", build],
    ["Security", security],
    ["Quality", quality],
  ]
    .filter(([, commands]) => commands.length)
    .map(
      ([key, commands]) =>
        `${key}: ${commands.map((cmd) => `\`${cmd}\``).join(" · ")}`,
    );
}

function javascript(pkg, has) {
  const deps = {
    ...(object(pkg.dependencies) ? pkg.dependencies : {}),
    ...(object(pkg.devDependencies) ? pkg.devDependencies : {}),
  };
  const scripts = object(pkg.scripts) ? pkg.scripts : {};
  const script = (name) =>
    typeof scripts[name] === "string" && scripts[name].trim();
  const check = (name) => {
    const command = script(name);
    return command && !/--(?:write|apply|fix(?!-dry-run\b))\b/.test(command);
  };
  const dep = (name) => Object.hasOwn(deps, name);
  const pm = has("pnpm-lock.yaml")
    ? "pnpm"
    : has("yarn.lock")
      ? "yarn"
      : has("bun.lock") || has("bun.lockb")
        ? "bun"
        : "npm";
  const run = (name) => (pm === "yarn" ? `yarn ${name}` : `${pm} run ${name}`);
  const exec = (name) =>
    ({ npm: "npx", pnpm: "pnpm exec", yarn: "yarn", bun: "bunx" })[pm] +
    ` ${name}`;
  const angular = has("angular.json");
  const testScript = script("test");
  const testCommand = pm === "bun" ? run("test") : `${pm} test`;
  const test =
    testScript && !testScript.includes("no test specified")
      ? [testCommand]
      : angular
        ? ["npx ng test --watch=false"]
        : dep("vitest")
          ? [exec("vitest run")]
          : dep("jest")
            ? [exec("jest")]
            : [];
  if (angular && testScript && /(?:^|\s)ng\s+test(?:\s|$)/.test(testScript)) {
    if (testScript === "ng test") test[0] = "npx ng test --watch=false";
    else if (!/--(?:watch|no-watch)\b/.test(testScript))
      test[0] = `${testCommand}${pm === "npm" || pm === "pnpm" ? " --" : ""} --watch=false`;
  }
  const lint = [];
  if (check("lint")) lint.push(run("lint"));
  else if (check("check")) lint.push(run("check"));
  else if (angular) {
    if (
      dep("eslint") ||
      Object.keys(deps).some((name) => name.startsWith("@angular-eslint/"))
    )
      lint.push("npx ng lint");
  } else {
    if (dep("@biomejs/biome") || dep("biome")) lint.push(exec("biome check ."));
    if (dep("eslint")) lint.push(exec("eslint ."));
  }
  if (check("typecheck")) lint.push(run("typecheck"));
  else if (check("type-check")) lint.push(run("type-check"));
  else if (has("tsconfig.json") && dep("typescript"))
    lint.push(exec("tsc --noEmit"));
  const build = script("build")
    ? [run("build")]
    : angular
      ? ["npx ng build"]
      : [];
  const locked = [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
  ].some(has);
  const security = !locked
    ? []
    : pm === "npm"
      ? ["npm audit --omit=dev --audit-level=high"]
      : pm === "pnpm"
        ? ["pnpm audit --prod --audit-level high"]
        : [];
  const quality = [];
  if (dep("fallow")) quality.push(exec("fallow dead-code"));
  if (dep("knip")) quality.push(exec("knip"));
  return lines(test, lint, build, security, quality);
}

/** Keep dependency declarations, excluding descriptions and unrelated tool values. */
function pythonDependencies(toml) {
  const declarations = [];
  let dependencyTable = false;
  let dependencyValue = false;
  for (const line of toml.split(/\r?\n/)) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (table) {
      dependencyTable =
        /(?:^|\.)(?:(?:optional-|dev-)?dependencies|dependency-groups)$/.test(
          table[1],
        );
      dependencyValue = false;
      continue;
    }
    const key = line.match(/^\s*([\w.-]+|"[^"]+"|'[^']+')\s*=/);
    if (key)
      dependencyValue = /^(?:dev-)?dependencies$/.test(
        key[1].replace(/["']/g, ""),
      );
    if (dependencyTable || dependencyValue) declarations.push(line);
  }
  return declarations.join("\n");
}

/** Match tool tables or dependency names, not comments or name substrings. */
function pythonTool(name, toml, dependencies, requirements) {
  return (
    new RegExp(`^\\s*\\[tool\\.${name}(?:\\.[^\\]]+)?\\]`, "mi").test(toml) ||
    new RegExp(
      `["']${name}(?:\\[[^\\]]*\\])?(?:\\s*[<>=!~@;][^"'\\r\\n]*)?["']`,
      "i",
    ).test(dependencies) ||
    new RegExp(`^\\s*["']?${name}["']?\\s*=`, "mi").test(dependencies) ||
    new RegExp(`^\\s*${name}(?:\\[[^\\]]*\\])?\\s*(?:[<>=!~@;]|$)`, "mi").test(
      requirements,
    )
  );
}

function python(toml, requirements, has) {
  const dependencies = pythonDependencies(toml);
  const prefix = has("uv.lock")
    ? "uv run "
    : has("poetry.lock")
      ? "poetry run "
      : "";
  const tool = (name, command = name) =>
    pythonTool(name, toml, dependencies, requirements)
      ? [prefix + command]
      : [];
  return lines(
    tool("pytest"),
    [
      ...tool("ruff", "ruff check ."),
      ...tool("mypy", "mypy ."),
      ...tool("pyright"),
    ],
    [],
    [...tool("pip-audit"), ...tool("bandit", "bandit -r .")],
    tool("vulture", "vulture ."),
  );
}

// From the home folder, so the project's rust-toolchain file picks no binary, and without
// letting rustup download a toolchain.
function hasRustfmt() {
  const probe = spawnSync("cargo", ["fmt", "--version"], {
    cwd: os.homedir(),
    env: { ...process.env, RUSTUP_AUTO_INSTALL: "0" },
    stdio: "ignore",
    timeout: 10_000,
  });
  return probe.status === 0;
}

function directory(dir, rel, probes) {
  const files = entries(dir)
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const has = (name) => files.includes(name);
  const text = (name) => read(path.join(dir, name));
  const blocks = [];
  const add = (ecosystem, commands) => {
    if (commands.length) blocks.push({ ecosystem, rel, lines: commands });
  };

  if (has("package.json")) {
    const pkg = json(path.join(dir, "package.json"));
    if (pkg)
      add(has("angular.json") ? "Angular" : "JS/TS", javascript(pkg, has));
  }

  const requirements = files.filter((name) =>
    /^requirements.*\.txt$/i.test(name),
  );
  if (
    has("pyproject.toml") ||
    requirements.length ||
    has("setup.py") ||
    has("setup.cfg")
  ) {
    const uncomment = (value) => value.replace(/#.*$/gm, "");
    add(
      "Python",
      python(
        uncomment(text("pyproject.toml")),
        uncomment(requirements.map(text).join("\n")),
        has,
      ),
    );
  }

  if (has("go.mod")) {
    const lint = ["go vet ./..."];
    if (
      [
        ".golangci.yml",
        ".golangci.yaml",
        ".golangci.toml",
        ".golangci.json",
      ].some(has)
    )
      lint.push("golangci-lint run");
    add("Go", lines(["go test ./..."], lint, ["go build ./..."]));
  }

  if (has("Cargo.toml")) {
    const security = [];
    if (has("deny.toml")) security.push("cargo deny check");
    if (
      entries(path.join(dir, ".cargo")).some(
        (entry) => entry.isFile() && entry.name === "audit.toml",
      )
    )
      security.push("cargo audit");
    add(
      "Rust",
      lines(
        ["cargo test"],
        [
          ...(probes.rustfmt() ? ["cargo fmt --check"] : []),
          "cargo clippy --all-targets -- -D warnings",
        ],
        ["cargo build"],
        security,
        text("Cargo.toml").includes("cargo-machete") ? ["cargo machete"] : [],
      ),
    );
  }

  if (has("pom.xml")) {
    const pom = text("pom.xml");
    const lint = [];
    if (pom.includes("maven-checkstyle-plugin"))
      lint.push("mvn checkstyle:check");
    if (pom.includes("spotbugs-maven-plugin")) lint.push("mvn spotbugs:check");
    add(
      "Java/Kotlin (Maven)",
      lines(
        ["mvn test"],
        lint,
        ["mvn -DskipTests package"],
        pom.includes("dependency-check-maven")
          ? ["mvn org.owasp:dependency-check-maven:check"]
          : [],
      ),
    );
  }

  if (has("build.gradle") || has("build.gradle.kts")) {
    const runner = has("gradlew") ? "./gradlew" : "gradle";
    const gradle = [
      "build.gradle",
      "build.gradle.kts",
      "settings.gradle",
      "settings.gradle.kts",
    ]
      .filter(has)
      .map(text)
      .join("\n");
    const lint = [];
    if (gradle.includes("detekt")) lint.push(`${runner} detekt`);
    if (gradle.includes("checkstyle")) lint.push(`${runner} checkstyleMain`);
    if (gradle.includes("ktlint")) lint.push(`${runner} ktlintCheck`);
    add(
      "Java/Kotlin (Gradle)",
      lines(
        [`${runner} test`],
        lint,
        [`${runner} assemble`],
        gradle.includes("org.owasp.dependencycheck")
          ? [`${runner} dependencyCheckAnalyze`]
          : [],
      ),
    );
  }

  if (files.some((name) => /\.(slnx?|csproj|fsproj)$/i.test(name))) {
    const solutions = files.filter((name) => /\.slnx?$/i.test(name));
    const solution = solutions[0] || "";
    const safeTarget = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.slnx?$/.test(solution)
      ? solution
      : /^[A-Za-z0-9_][A-Za-z0-9_. -]*\.slnx?$/.test(solution)
        ? `"${solution}"`
        : "";
    const target =
      solutions.length === 1 &&
      safeTarget &&
      files.some((name) => /\.(csproj|fsproj)$/i.test(name))
        ? ` ${safeTarget}`
        : "";
    add(
      ".NET",
      lines(
        [`dotnet test${target}`],
        [`dotnet format${target} --verify-no-changes`],
        [`dotnet build${target}`],
        [`dotnet list${target} package --vulnerable --include-transitive`],
      ),
    );
  }

  if (has("composer.json")) {
    const composer = json(path.join(dir, "composer.json"));
    if (composer) {
      const deps = {
        ...(object(composer.require) ? composer.require : {}),
        ...(object(composer["require-dev"]) ? composer["require-dev"] : {}),
      };
      const tool = (dep, configs) =>
        Object.hasOwn(deps, dep) || configs.some(has);
      const lint = [];
      if (tool("phpstan/phpstan", ["phpstan.neon", "phpstan.neon.dist"]))
        lint.push("vendor/bin/phpstan analyse");
      if (tool("vimeo/psalm", ["psalm.xml"])) lint.push("vendor/bin/psalm");
      if (tool("squizlabs/php_codesniffer", ["phpcs.xml", "phpcs.xml.dist"]))
        lint.push("vendor/bin/phpcs");
      add(
        "PHP",
        lines(
          tool("phpunit/phpunit", ["phpunit.xml", "phpunit.xml.dist"])
            ? ["vendor/bin/phpunit"]
            : [],
          lint,
          [],
          has("composer.lock") ? ["composer audit"] : [],
        ),
      );
    }
  }
  return blocks;
}

function detect(dir = ".", probes = { rustfmt: hasRustfmt }) {
  const root = path.resolve(dir);
  const children = entries(root)
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        !SKIP.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  return [
    ...directory(root, ".", probes),
    ...children.flatMap((name) =>
      directory(path.join(root, name), name, probes),
    ),
  ];
}

function format(blocks) {
  return blocks
    .map(({ ecosystem, rel, lines: commands }) =>
      [`## ${ecosystem} · ${rel}`, ...commands].join("\n"),
    )
    .join("\n\n");
}

function main() {
  const output = format(detect(process.argv[2] || "."));
  if (output) process.stdout.write(output + "\n");
}

if (require.main === module) main();

module.exports = { detect, format };
