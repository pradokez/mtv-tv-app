import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkCatalog, checkToken } from "./guards.ts";
import { fakeCatalog } from "./test-helpers.ts";

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
