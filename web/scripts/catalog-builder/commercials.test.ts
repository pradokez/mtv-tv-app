import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CommercialsError, parseCuratedCommercials } from "./commercials.ts";

const ID = "Kw_gPddlzLM";
const entry = (fields = {}) => ({ id: ID, brand: "Parmalat", year: 1996, title: "Mamíferos", ...fields });
const file = (...entries: unknown[]) => JSON.stringify({ commercials: entries });

describe("parseCuratedCommercials", () => {
  it("reads id, brand, title and year, keeping the file order", () => {
    const other = "NatlghQ18Mo";

    const list = parseCuratedCommercials(file(entry(), entry({ id: other, year: null })));

    expect(list).toEqual([
      { id: ID, brand: "Parmalat", title: "Mamíferos", year: 1996 },
      { id: other, brand: "Parmalat", title: "Mamíferos", year: null },
    ]);
  });

  it("rejects a file that is not { commercials: [...] }", () => {
    expect(() => parseCuratedCommercials("{")).toThrow(CommercialsError);
    expect(() => parseCuratedCommercials(JSON.stringify([]))).toThrow(/commercials/);
    expect(() => parseCuratedCommercials(JSON.stringify({ commercials: {} }))).toThrow(/lista/);
  });

  it("rejects an invalid entry, naming its position", () => {
    expect(() => parseCuratedCommercials(file(entry(), entry({ brand: 3 })))).toThrow(/posição 1/);
    expect(() => parseCuratedCommercials(file(entry({ year: "1996" })))).toThrow(/posição 0/);
  });

  it("rejects ids that are not 11-character YouTube ids", () => {
    expect(() => parseCuratedCommercials(file(entry({ id: "curto" })))).toThrow(/posição 0.*ID/);
  });

  it("rejects a repeated id", () => {
    expect(() => parseCuratedCommercials(file(entry(), entry()))).toThrow(/posição 1.*repetido/);
  });

  it("accepts the committed curated list", () => {
    const text = readFileSync(new URL("../../curadoria/comerciais-br.json", import.meta.url), "utf8");

    expect(parseCuratedCommercials(text)).toHaveLength(51);
  });
});
