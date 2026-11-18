import { expect, test } from "claude-code/testing";

import {
  isProtected,
  parseProtected,
  relativeTo,
  shellWritesProtected,
} from "./guard-policy";

const GLOBS = [
  "biome.json",
  "tsconfig*.json",
  ".github/workflows/**",
  "e2e/**",
];

test("parseProtected reads the Protected line under Commands only", () => {
  expect(
    parseProtected(
      "## Commands\n\n- Test: `npm test`\n- Protected: `biome.json`, tsconfig*.json .github/workflows/**\n\n## Other\n\n- Protected: nope\n",
    ),
  ).toEqual(["biome.json", "tsconfig*.json", ".github/workflows/**"]);
  expect(parseProtected("## Commands\n\n- Protected: —\n")).toEqual([]);
  expect(parseProtected("# App\n\n- Protected: biome.json\n")).toEqual([]);
  expect(parseProtected("")).toEqual([]);
});

test("globs: names match in any folder, * stays in a folder, ** crosses folders", () => {
  expect(isProtected("biome.json", GLOBS)).toBe(true);
  expect(isProtected("app/biome.json", GLOBS)).toBe(true);
  expect(isProtected("tsconfig.build.json", GLOBS)).toBe(true);
  expect(isProtected(".github/workflows/ci.yml", GLOBS)).toBe(true);
  expect(isProtected("e2e/a/b/login.spec.ts", GLOBS)).toBe(true);
  expect(isProtected("src/biome.jsonc", GLOBS)).toBe(false);
  expect(isProtected("src/e2e.ts", GLOBS)).toBe(false);
  expect(isProtected("src/a.ts", GLOBS)).toBe(false);
  expect(isProtected("BIOME.JSON", GLOBS)).toBe(true);
  expect(isProtected("e2e\\login.spec.ts", GLOBS)).toBe(true);
});

test("relativeTo strips the project root, case-insensitively, and keeps other paths", () => {
  expect(relativeTo("/p/app", "/p/app/biome.json")).toBe("biome.json");
  expect(relativeTo("C:\\p\\app", "c:\\p\\app\\e2e\\a.ts")).toBe("e2e/a.ts");
  expect(relativeTo("/p/app", "/other/biome.json")).toBe("/other/biome.json");
});

test("a shell command that writes a protected path is caught; reading it is not", () => {
  for (const cmd of [
    "echo '{}' > biome.json",
    "sed -i 's/error/off/' biome.json",
    "sed -i '' 's/a/b/' app/tsconfig.json",
    "rm e2e/login.spec.ts",
    "mv tsconfig.json /tmp/x && npm test",
    "git checkout HEAD -- biome.json",
    "cp /tmp/x .github/workflows/ci.yml",
    "Set-Content -Path biome.json -Value '{}'",
    "cat a | tee e2e/out.txt",
  ])
    expect(shellWritesProtected(cmd, GLOBS), cmd).toBe(true);
  for (const cmd of [
    "cat biome.json",
    "cat biome.json > /tmp/out.txt",
    "grep -n error biome.json",
    "npm test -- e2e/login.spec.ts",
    "echo hi > src/a.ts",
    "git diff biome.json",
    "rm src/a.ts && cat biome.json",
  ])
    expect(shellWritesProtected(cmd, GLOBS), cmd).toBe(false);
});

test("paths are cleaned: .. segments, ./ and macOS /private cannot dodge a glob", () => {
  expect(relativeTo("/p/app", "/p/app/src/../e2e/a.ts")).toBe("e2e/a.ts");
  expect(isProtected(relativeTo("/p/app", "/p/app/src/../e2e/a.ts"), GLOBS)).toBe(true);
  expect(relativeTo("/var/x/app", "/private/var/x/app/biome.json")).toBe("biome.json");
  expect(isProtected("a.ts", ["./biome.json"])).toBe(false);
  expect(isProtected("app/biome.json", ["./biome.json"])).toBe(true); // a bare name: any folder
  expect(isProtected("e2e/a.ts", ["./e2e/?.ts"])).toBe(true);
  expect(isProtected("e2e/ab.ts", ["./e2e/?.ts"])).toBe(false);
  expect(isProtected("biome.json", ["./biome.json"])).toBe(true);
});

test("more writers are caught, a copy only writes its last argument", () => {
  for (const cmd of [
    "echo '{}' >| biome.json",
    "echo x >biome.json",
    "cp x biome.json 2>&1",
    "cp x biome.json > log",
    "cp x biome.json 2>&1 &",
    "cp x biome.json &>/dev/null",
    "cp x biome.json >/dev/null 2>&1 &",
    "cp x biome.json 2>/dev/null",
    "cp x biome.json # backup",
    "cp x biome.json &",
    "cp x 'biome.json'",
    'cp x "e2e/a.ts"',
    "sed --in-place s/a/b/ biome.json",
    "dd if=x of=biome.json",
    "echo x>biome.json",
    "echo x >>e2e/a.ts",
    "git apply fix.diff biome.json",
    "patch biome.json fix.diff",
    "cp /tmp/x biome.json",
    "echo x | tee biome.json",
  ])
    expect(shellWritesProtected(cmd, GLOBS), cmd).toBe(true);
  for (const cmd of [
    "cp biome.json /tmp/backup",
    "cp biome.json x > log",
    "cp biome.json x 2>&1 &",
    "rm /tmp/x | cat biome.json",
    "ls e2e/a e2e/b src",
  ])
    expect(shellWritesProtected(cmd, GLOBS), cmd).toBe(false);
});

test("** in a shell command reaches nested files; odd paths still resolve to the project", () => {
  for (const cmd of [
    "rm e2e/sub/deep/test.ts",
    "echo x > .github/workflows/ci.yml",
    "git checkout HEAD -- e2e/auth/login.spec.ts",
  ])
    expect(shellWritesProtected(cmd, GLOBS), cmd).toBe(true);
  expect(relativeTo("/p/app", "/p/app//e2e/a.ts")).toBe("e2e/a.ts");
  expect(relativeTo("/p/app", "/../p/app/e2e/a.ts")).toBe("e2e/a.ts");
  expect(relativeTo("/p/app", "e2e/a.ts")).toBe("e2e/a.ts");
  expect(relativeTo("/p/app", "../app/e2e/a.ts")).toBe("e2e/a.ts");
  expect(relativeTo("C:\\p\\app", "C:/p/app/../app/e2e/a.ts")).toBe("e2e/a.ts");
  expect(isProtected(relativeTo("/p/app", "../other/e2e/a.ts"), GLOBS)).toBe(false); // another project
});
