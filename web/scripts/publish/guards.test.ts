import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkBuild, checkCatalog } from "./guards.ts";
import { fakeCatalog, writeTree } from "./test-helpers.ts";

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

  it("fails when the catalog is not JSON or not valid for the app", () => {
    expect(() => checkCatalog("{", example)).toThrow(/não é um JSON válido/);
    expect(() => checkCatalog(JSON.stringify({ schemaVersion: 99 }), example)).toThrow(/esquema v99/);
  });

  it("passes for a catalog the size of the real one", () => {
    expect(() => checkCatalog(fakeCatalog(20, 100), example)).not.toThrow();
  });
});

describe("checkBuild", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "publish-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const app = { "index.html": "<html></html>", "assets/index.js": "1" };

  it("passes when the build has the app at its root and the real catalog", () => {
    writeTree(dir, { ...app, "catalog.json": fakeCatalog(20, 100) });

    expect(() => checkBuild(dir, example)).not.toThrow();
  });

  it("fails when the build has no index.html", () => {
    writeTree(dir, { "catalog.json": fakeCatalog(20, 100) });

    expect(() => checkBuild(dir, example)).toThrow(/index.html não existe/);
  });

  it("fails when the build shipped the example catalog or none", () => {
    writeTree(dir, app);
    expect(() => checkBuild(dir, example)).toThrow(/catálogo real não encontrado em .*catalog.json/);

    writeTree(dir, { "catalog.json": example });
    expect(() => checkBuild(dir, example)).toThrow(/catalog.json é o catálogo de exemplo/);
  });
});
