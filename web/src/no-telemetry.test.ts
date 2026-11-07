import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// Neither the app nor the Catalog Builder may ever hit the original site's
// play counters or telemetry: it would skew its creator's stats.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const thisFile = fileURLToPath(import.meta.url);
const skippedDirs = new Set([".git", "node_modules", "dist", "build", ".gradle", ".idea"]);
// The generated snapshot is data (video ids and titles), not code.
const snapshot = join(repoRoot, "web", "public", "catalog.json");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (skippedDirs.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

it("never references the site's counter or telemetry endpoints anywhere in the project", () => {
  const files = filesUnder(repoRoot).filter((path) => path !== thisFile && path !== snapshot);

  const offenders = files.filter((path) => /\/api\/(counter|track-play)/.test(readFileSync(path, "utf8")));

  expect(files.length).toBeGreaterThan(10);
  expect(offenders).toEqual([]);
});
