import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readIfExists } from "./guards.ts";
import { loadConfig } from "./main.ts";

// The Cloudflare credentials live only in the git-ignored `web/.publish.local`
// (or the environment), never in a committed file.
const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const git = (...args: string[]) => execFileSync("git", args, { cwd: webRoot, encoding: "utf8" });

describe("publish secrets", () => {
  it.each([".publish.local", "dist-tizen/catalog.json", "public/catalog.json"])("git ignores %s", (path) => {
    expect(git("check-ignore", path).trim()).toBe(path);
  });

  const localFile = join(webRoot, ".publish.local");
  const config = loadConfig(readIfExists(localFile), process.env);
  const secrets = [config.CLOUDFLARE_API_TOKEN].filter((s): s is string => !!s);

  it.skipIf(secrets.length === 0)("no committed file contains the configured API token", () => {
    const files = git("ls-files", "-z", "--full-name", ":/").split("\0").filter(Boolean);
    const root = git("rev-parse", "--show-toplevel").trim();
    const leaks = files.filter((file) => {
      const path = join(root, file);
      if (!existsSync(path)) return false;
      const text = readFileSync(path, "latin1");
      return secrets.some((secret) => text.includes(secret));
    });

    expect(leaks).toEqual([]);
  });
});
