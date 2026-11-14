import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildManifest, MIN_SHELL } from "./manifest.ts";
import { writeTree } from "./test-helpers.ts";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("buildManifest", () => {
  let dir: string;
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "manifest-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("lists each file with its sha256 and size, and carries the version and minShell", () => {
    writeTree(dir, { "index.html": "<html></html>", "catalog.json": "{}" });

    const manifest = buildManifest(dir, "site-20261114-120000");

    expect(manifest.version).toBe("site-20261114-120000");
    expect(manifest.minShell).toBe(MIN_SHELL);
    expect(manifest.files).toContainEqual({ path: "index.html", sha256: sha256("<html></html>"), size: 13 });
    expect(manifest.files).toContainEqual({ path: "catalog.json", sha256: sha256("{}"), size: 2 });
  });

  it("uses forward slashes for nested files and a stable (sorted) order", () => {
    writeTree(dir, { "index.html": "a", "assets/z.js": "b", "assets/a.js": "c", "assets/sub/x.css": "d" });

    expect(buildManifest(dir, "site-20261114-120000").files.map((f) => f.path)).toEqual([
      "assets/a.js",
      "assets/sub/x.css",
      "assets/z.js",
      "index.html",
    ]);
  });

  it("leaves out .nojekyll and manifest.json itself", () => {
    writeTree(dir, { "index.html": "a", ".nojekyll": "", "manifest.json": "{}" });

    expect(buildManifest(dir, "site-20261114-120000").files.map((f) => f.path)).toEqual(["index.html"]);
  });
});
