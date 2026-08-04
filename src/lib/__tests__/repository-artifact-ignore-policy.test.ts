import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const PROJECT_ROOT = resolve(__dirname, "../../..");

const EXPECTED_RULES = [
  "/cypress/screenshots/",
  "/cypress/videos/",
  "/cypress/downloads/",
] as const;

const GENERATED_PATHS = [
  "cypress/screenshots/example.cy.ts/screenshot.png",
  "cypress/videos/example.cy.ts.mp4",
  "cypress/downloads/report.xlsx",
] as const;

const SOURCE_PATHS = [
  "cypress/e2e/requests/structured-rendition-report.cy.ts",
  "cypress/fixtures/example.json",
] as const;

function isIgnored(path: string): boolean {
  const result = spawnSync("git", ["check-ignore", "--no-index", "--quiet", "--", path], {
    cwd: PROJECT_ROOT,
  });
  if (![0, 1].includes(result.status ?? -1)) {
    throw new Error(`git check-ignore failed for ${path}`);
  }
  return result.status === 0;
}

describe("repository artifact ignore policy", () => {
  it("ignores regenerated Cypress outputs without hiding specs or fixtures", () => {
    const rules = new Set(
      readFileSync(resolve(PROJECT_ROOT, ".gitignore"), "utf8")
        .split(/\r?\n/u)
        .filter(Boolean),
    );

    for (const rule of EXPECTED_RULES) expect(rules.has(rule)).toBe(true);
    for (const path of GENERATED_PATHS) expect(isIgnored(path)).toBe(true);
    for (const path of SOURCE_PATHS) expect(isIgnored(path)).toBe(false);
  });
});
