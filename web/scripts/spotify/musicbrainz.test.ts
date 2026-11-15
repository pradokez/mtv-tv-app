import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { genresFromSearch, lookupGenres } from "./musicbrainz.ts";

const cachePath = () => join(mkdtempSync(join(tmpdir(), "mb-")), "cache.json");
const nirvana = { name: "Nirvana", score: 100, tags: [{ name: "Rock", count: 9 }, { name: "grunge", count: 20 }, { name: "noise", count: 0 }] };

describe("genresFromSearch", () => {
  it("takes the tags of the matching artist, best-voted first, lowercased, without zero-vote tags", () => {
    expect(genresFromSearch("nirvana", [nirvana])).toEqual(["grunge", "rock"]);
  });

  it("ignores a different artist, a weak score and accents/case differences in the name", () => {
    expect(genresFromSearch("Nirvana", [{ ...nirvana, name: "Nirvana (UK)" }])).toEqual([]);
    expect(genresFromSearch("Nirvana", [{ ...nirvana, score: 70 }])).toEqual([]);
    expect(genresFromSearch("Beyonce", [{ name: "Beyoncé", score: 100, tags: [{ name: "r&b", count: 5 }] }])).toEqual(["r&b"]);
  });
});

describe("lookupGenres", () => {
  it("looks each artist up once, caches the answers and sends a User-Agent", async () => {
    const path = cachePath();
    const calls: { url: string; agent: string | undefined }[] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, agent: (init?.headers as Record<string, string>)["User-Agent"] });
      return new Response(JSON.stringify({ artists: url.includes("Nirvana") ? [nirvana] : [] }));
    };

    const first = await lookupGenres(["Nirvana", "Unknown", "Nirvana"], { cachePath: path, fetch, delayMs: 0 });
    const second = await lookupGenres(["Nirvana", "Unknown"], { cachePath: path, fetch, delayMs: 0 });

    expect(first.get("Nirvana")).toEqual(["grunge", "rock"]);
    expect(first.get("Unknown")).toEqual([]);
    expect(second.get("Nirvana")).toEqual(["grunge", "rock"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.agent).toMatch(/mtv-tv-app/);
  });

  it("fails clearly on an HTTP error, keeping what it already has", async () => {
    const path = cachePath();
    let n = 0;
    const fetch = async () => (++n === 1 ? new Response(JSON.stringify({ artists: [nirvana] })) : new Response("", { status: 500 }));

    await expect(lookupGenres(["Nirvana", "Other"], { cachePath: path, fetch, delayMs: 0 })).rejects.toThrow(/HTTP 500.*Other/);
    const resumed = await lookupGenres(["Nirvana"], { cachePath: path, fetch: async () => new Response("", { status: 500 }), delayMs: 0 });
    expect(resumed.get("Nirvana")).toEqual(["grunge", "rock"]);
  });
});
