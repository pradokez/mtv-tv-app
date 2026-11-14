import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkCatalog, checkStaged, checkToken } from "./guards.ts";
import { fakeCatalog, stagedTree, TOKEN, writeTree } from "./test-helpers.ts";

const example = readFileSync(new URL("../../fixtures/catalog.example.json", import.meta.url), "utf8");

describe("checkCatalog", () => {
  it("fails when there is no catalog", () => {
    expect(() => checkCatalog(undefined, example)).toThrow(/catálogo real não encontrado/);
  });

  it("never publishes the example catalog", () => {
    expect(() => checkCatalog(example, example)).toThrow(/catálogo de exemplo/);
    expect(() => checkCatalog(JSON.stringify(JSON.parse(example)), example)).toThrow(/catálogo de exemplo/);
  });
});

describe("checkCatalog with a generated catalog", () => {
  it("fails when the catalog is too small to be the real one", () => {
    expect(() => checkCatalog(fakeCatalog(5, 300), example)).toThrow(/5 canais/);
    expect(() => checkCatalog(fakeCatalog(20, 10), example)).toThrow(/200 vídeos/);
  });

  it("fails when the catalog is not valid for the app", () => {
    expect(() => checkCatalog(JSON.stringify({ schemaVersion: 99 }), example)).toThrow(/esquema v99/);
  });

  it("passes for a catalog the size of the real one", () => {
    expect(() => checkCatalog(fakeCatalog(20, 100), example)).not.toThrow();
  });
});

describe("checkToken", () => {
  it("fails without a secret path", () => {
    expect(() => checkToken(undefined)).toThrow(/PUBLISH_TOKEN/);
    expect(() => checkToken("")).toThrow(/PUBLISH_TOKEN/);
  });

  it("fails for a short or guessable token", () => {
    expect(() => checkToken("abc123")).toThrow(/32 caracteres/);
    expect(() => checkToken(`${"a".repeat(31)}/`)).toThrow(/32 caracteres/);
  });

  it("returns a long random token", () => {
    expect(checkToken("Xk3_9-qv7LpZ2mN8rT4wY6bC1dF5gH0j")).toBe("Xk3_9-qv7LpZ2mN8rT4wY6bC1dF5gH0j");
  });
});

describe("checkStaged", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "publish-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function check(files: Record<string, string | undefined>): void {
    const tree = { ...stagedTree(), ...files };
    writeTree(dir, Object.fromEntries(Object.entries(tree).filter(([, v]) => v !== undefined)) as Record<string, string>);
    checkStaged(dir, TOKEN, example);
  }

  it("passes when the app is under the secret path with noindex everywhere", () => {
    expect(() => check({})).not.toThrow();
  });

  it("fails when the app is not under the secret path", () => {
    expect(() => check({ [`${TOKEN}/index.html`]: undefined })).toThrow(/caminho secreto/);
  });

  it("fails when index.html is also at the root", () => {
    expect(() => check({ "index.html": "<html></html>" })).toThrow(/fora do caminho secreto/);
  });

  it("fails without the noindex header", () => {
    expect(() => check({ _headers: undefined })).toThrow(/_headers/);
    expect(() => check({ _headers: "/*\n  X-Frame-Options: DENY\n" })).toThrow(/X-Robots-Tag: noindex/);
  });

  it("fails without the noindex meta tag", () => {
    expect(() => check({ [`${TOKEN}/index.html`]: "<html><head></head></html>" })).toThrow(/meta robots/);
  });

  it("fails with a robots.txt, which would reveal the path", () => {
    expect(() => check({ "robots.txt": `User-agent: *\nDisallow: /${TOKEN}/` })).toThrow(/robots.txt/);
  });

  it("fails when the staged catalog is not the real one", () => {
    expect(() => check({ [`${TOKEN}/catalog.json`]: example })).toThrow(/catálogo de exemplo/);
  });

  it("fails when the page loads assets from the site root, outside the secret path", () => {
    expect(() =>
      check({ [`${TOKEN}/index.html`]: '<head><meta name="robots" content="noindex"><script src="/assets/index.js"></script></head>' }),
    ).toThrow(/caminho absoluto/);
  });
});
