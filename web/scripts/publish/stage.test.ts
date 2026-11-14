import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkStaged } from "./guards.ts";
import { stage } from "./stage.ts";
import { fakeCatalog, TOKEN, writeTree } from "./test-helpers.ts";

const example = readFileSync(new URL("../../fixtures/catalog.example.json", import.meta.url), "utf8");

/** Shaped like `dist-tizen/`. */
const BUILD = {
  "index.html":
    '<!doctype html>\n<html lang="pt-BR">\n  <head>\n    <meta charset="UTF-8" />\n    <title>MTV TV</title>\n    <script defer src="./assets/index-abc.js"></script>\n  </head>\n</html>\n',
  "assets/index-abc.js": "console.log(1);",
  "catalog.json": fakeCatalog(20, 100),
};

describe("stage", () => {
  let root: string;
  let build: string;
  let out: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "stage-"));
    build = join(root, "dist-tizen");
    out = join(root, "dist-publish");
    writeTree(build, BUILD);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("puts the build under the secret path, ready for the guards", () => {
    stage({ build, out, token: TOKEN });

    expect(readFileSync(join(out, TOKEN, "assets/index-abc.js"), "utf8")).toBe("console.log(1);");
    expect(existsSync(join(out, "index.html"))).toBe(false);
    expect(() => checkStaged(out, TOKEN, example)).not.toThrow();
  });

  it("adds noindex by meta tag, by header and to the not-found page", () => {
    stage({ build, out, token: TOKEN });

    expect(readFileSync(join(out, TOKEN, "index.html"), "utf8")).toContain(
      '<meta name="robots" content="noindex, nofollow" />\n    <title>MTV TV</title>',
    );
    expect(readFileSync(join(out, "_headers"), "utf8")).toBe("/*\n  X-Robots-Tag: noindex, nofollow\n");
    expect(readFileSync(join(out, "404.html"), "utf8")).toContain('content="noindex, nofollow"');
  });

  it("starts from scratch, so a previous token's path is not published again", () => {
    stage({ build, out, token: TOKEN });
    const other = "Q".repeat(40);
    stage({ build, out, token: other });

    expect(existsSync(join(out, TOKEN))).toBe(false);
    expect(existsSync(join(out, other, "index.html"))).toBe(true);
  });

  it("fails when the build has no index.html", () => {
    rmSync(join(build, "index.html"));

    expect(() => stage({ build, out, token: TOKEN })).toThrow(/pnpm build:tizen/);
  });
});
