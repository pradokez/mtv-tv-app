import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findClips } from "./youtube-search.ts";

const KEY = "chave-secreta-123";
const cachePath = () => join(mkdtempSync(join(tmpdir(), "yt-search-")), "cache.json");
const reply = (items: { videoId: string; title: string; channelTitle: string }[]) =>
  new Response(JSON.stringify({ items: items.map((i) => ({ id: { videoId: i.videoId }, snippet: { title: i.title, channelTitle: i.channelTitle } })) }));
const songs = [
  { id: "s1", artist: "a-ha", song: "Take On Me" },
  { id: "s2", artist: "Obscure", song: "Nothing" },
];

describe("findClips", () => {
  it("finds the clip, remembers songs without one and never searches them again", async () => {
    const path = cachePath();
    let calls = 0;
    const fetch = async (url: string) => {
      calls++;
      return url.includes("Take+On+Me") ? reply([{ videoId: "clip0000001", title: "a-ha - Take On Me (Official Video)", channelTitle: "a-ha" }]) : reply([]);
    };

    const first = await findClips(songs, { apiKey: KEY, cachePath: path, fetch });
    const second = await findClips(songs, { apiKey: KEY, cachePath: path, fetch });

    expect([...first.clips]).toEqual([["s1", "clip0000001"]]);
    expect(first.withoutClip).toBe(1);
    expect(calls).toBe(2);
    expect([...second.clips]).toEqual([["s1", "clip0000001"]]);
  });

  it("stops at the search budget and reports what is left", async () => {
    const result = await findClips(songs, { apiKey: KEY, cachePath: cachePath(), maxSearches: 1, fetch: async () => reply([]) });

    expect(result).toMatchObject({ searches: 1, pending: 1, withoutClip: 1 });
  });

  it("stops without failing when the daily quota is over, keeping what it has", async () => {
    const path = cachePath();
    let calls = 0;
    const fetch = async () => {
      calls++;
      return calls === 1
        ? reply([{ videoId: "clip0000001", title: "a-ha - Take On Me (Official Video)", channelTitle: "a-ha" }])
        : new Response(JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } }), { status: 403 });
    };

    const result = await findClips(songs, { apiKey: KEY, cachePath: path, fetch });

    expect(result.clips.size).toBe(1);
    expect(result.pending).toBe(1);
  });

  it("never leaks the API key into errors or the cache", async () => {
    const path = cachePath();
    await findClips([songs[0]!], { apiKey: KEY, cachePath: path, fetch: async () => reply([]) });
    expect(readFileSync(path, "utf8")).not.toContain(KEY);

    const failing = async (url: string) => {
      throw new Error(`falhou ${url}`);
    };
    await expect(findClips(songs, { apiKey: KEY, cachePath: cachePath(), fetch: failing })).rejects.toThrow(/\*\*\*/);
    await expect(findClips(songs, { apiKey: KEY, cachePath: cachePath(), fetch: failing })).rejects.not.toThrow(KEY);
  });
});
