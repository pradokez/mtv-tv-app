import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fetchLikedTracks, pkcePair, toLikedTrack } from "./spotify.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const item = (id: string, artists: { id: string; name: string }[], date = "1991-09-10") => ({
  track: { id, name: `Song ${id}`, artists, album: { release_date: date } },
});

describe("pkcePair", () => {
  it("makes the S256 challenge of the verifier", () => {
    const { verifier, challenge } = pkcePair();

    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("toLikedTrack", () => {
  it("reads artist, song and release year", () => {
    expect(toLikedTrack(item("t1", [{ id: "a1", name: "Nirvana" }, { id: "a2", name: "X" }], "1991"))).toEqual({
      id: "t1",
      artist: "Nirvana, X",
      artistNames: ["Nirvana", "X"],
      song: "Song t1",
      year: 1991,
      genres: [],
    });
  });

  it("skips local files and incomplete entries", () => {
    expect(toLikedTrack({ track: { id: null, name: "x", is_local: true, artists: [{ name: "a" }] } })).toBeUndefined();
    expect(toLikedTrack({ track: null })).toBeUndefined();
    expect(toLikedTrack({ track: { id: "t", name: "x", artists: [] } })).toBeUndefined();
  });
});

describe("fetchLikedTracks", () => {
  it("pages through the likes", async () => {
    const a1 = { id: "a1", name: "Nirvana" };
    const fetch = async (url: string) =>
      url.includes("offset=0") ? json({ items: [item("t1", [a1])], next: "more" }) : json({ items: [item("t2", [a1], "2022-11-11")], next: null });

    const tracks = await fetchLikedTracks("token", { fetch });

    expect(tracks.map((t) => [t.id, t.year, t.genres])).toEqual([["t1", 1991, []], ["t2", 2022, []]]);
  });

  it("fails clearly when the likes cannot be read", async () => {
    await expect(fetchLikedTracks("token", { fetch: async () => json({}, 401) })).rejects.toThrow(/HTTP 401/);
  });
});
