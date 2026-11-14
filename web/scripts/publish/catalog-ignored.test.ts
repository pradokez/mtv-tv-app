import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The real catalog goes only to the gh-pages branch (and its tags), never to main.
const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const git = (...args: string[]) => execFileSync("git", args, { cwd: webRoot, encoding: "utf8" });

describe("real catalog stays out of git", () => {
  it.each(["dist-tizen/catalog.json", "public/catalog.json"])("git ignores %s", (path) => {
    expect(git("check-ignore", path).trim()).toBe(path);
  });

  it("only the small example catalog is versioned", () => {
    const versioned = git("ls-files", "-z", "--full-name", ":/").split("\0").filter((f) => /(^|\/)catalog[^/]*\.json$/.test(f));
    const root = git("rev-parse", "--show-toplevel").trim();

    expect(versioned).toEqual(["web/fixtures/catalog.example.json"]);
    // The real snapshot is ~10 MB.
    expect(statSync(join(root, versioned[0]!)).size).toBeLessThan(100_000);
  });
});
