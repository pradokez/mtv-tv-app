import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// The app must never call the original site (counters, telemetry, data): the
// catalog is bundled. This guards against a reference sneaking into the code.
const webRoot = fileURLToPath(new URL("..", import.meta.url));
const thisFile = fileURLToPath(import.meta.url);
// The generated snapshot is data, not code: video titles may mention the site.
const snapshot = join(webRoot, "public", "catalog.json");

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

it("has no reference to wantmymtv in the app code, assets or page", () => {
  const files = [
    ...filesUnder(join(webRoot, "src")),
    ...filesUnder(join(webRoot, "public")),
    ...filesUnder(join(webRoot, "fixtures")),
    join(webRoot, "index.html"),
  ].filter((path) => path !== thisFile && path !== snapshot);

  const offenders = files.filter((path) => /wantmymtv/i.test(readFileSync(path, "utf8")));

  expect(offenders).toEqual([]);
});
