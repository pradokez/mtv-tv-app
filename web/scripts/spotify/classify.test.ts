import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, decadeChannel, GenreRulesError, parseGenreRules } from "./classify.ts";

const rules = parseGenreRules(readFileSync(new URL("../../curadoria/generos-canais.json", import.meta.url), "utf8"));

describe("decadeChannel", () => {
  it("maps release years to the site's decade channels", () => {
    expect([1970, 1979, 1985, 1999, 2000, 2009, 2013, 2024].map(decadeChannel)).toEqual(["70s", "70s", "80s", "90s", "2000s", "2000s", "2010s", "2020s"]);
  });

  it("has no channel before 1970 or without a year", () => {
    expect(decadeChannel(1969)).toBeUndefined();
    expect(decadeChannel(undefined)).toBeUndefined();
  });
});

describe("classify", () => {
  it("puts the decade first and then every genre channel that fits", () => {
    expect(classify({ year: 1992, genres: ["grunge", "alternative rock"] }, rules)).toEqual(["90s", "grunge"]);
  });

  it("matches whole words only", () => {
    expect(classify({ year: 2015, genres: ["trap", "rap metal"] }, rules)).toEqual(["2010s", "metal", "raps"]);
    expect(classify({ year: 2015, genres: ["trap"] }, rules)).toEqual(["2010s"]);
  });

  it("does not send Brazilian funk to the funk channel", () => {
    expect(classify({ year: 2019, genres: ["funk carioca"] }, rules)).toEqual(["2010s"]);
    expect(classify({ year: 1975, genres: ["funk", "soul"] }, rules)).toEqual(["70s", "funk"]);
  });

  it("returns only the decade without genres, and nothing for an old song without genres", () => {
    expect(classify({ year: 2021, genres: [] }, rules)).toEqual(["2020s"]);
    expect(classify({ year: 1965, genres: [] }, rules)).toEqual([]);
  });

  it("does not repeat a channel", () => {
    expect(classify({ year: 1985, genres: ["hair metal", "glam metal"] }, rules)).toEqual(["80s", "hairmetal", "metal"]);
  });
});

describe("parseGenreRules", () => {
  it("rejects bad files naming the rule", () => {
    expect(() => parseGenreRules("{")).toThrow(GenreRulesError);
    expect(() => parseGenreRules("{}")).toThrow(/genres/);
    expect(() => parseGenreRules(JSON.stringify({ genres: [{ channel: "x", genres: [] }] }))).toThrow(/posição 0.*x/);
  });
});
