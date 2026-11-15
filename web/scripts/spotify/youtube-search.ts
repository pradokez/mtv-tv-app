/**
 * Looks for the clip of each liked song on YouTube (`search.list`, 100 quota
 * units per search, so about 100 songs per day on the default 10,000-unit
 * quota). Answers, including "no clip", are cached on disk after every song,
 * so a run stopped by the quota resumes the next day where it stopped. The
 * API key goes only into the request URL and is never logged or cached.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pickClip, type SearchResult, type WantedSong } from "./clip-match.ts";

const ENDPOINT = "https://www.googleapis.com/youtube/v3/search";

export interface ClipSearchOptions {
  apiKey: string;
  /** JSON `{ spotifyTrackId: { videoId } | { none: true } }`, created if missing. */
  cachePath: string;
  fetch?: (url: string) => Promise<Response>;
  /** Stops after this many searches (a daily budget). */
  maxSearches?: number;
  onProgress?: (done: number, total: number) => void;
}

type Cache = Record<string, { videoId: string } | { none: true }>;

export interface SongToFind extends WantedSong {
  /** Spotify track id, the cache key. */
  id: string;
}

export interface ClipSearchResult {
  /** Spotify track id → YouTube video id, for the songs with a clip. */
  clips: Map<string, string>;
  /** Songs searched and found to have no clip. */
  withoutClip: number;
  /** Songs still to search (budget or quota ended first). */
  pending: number;
  searches: number;
}

function readCache(path: string): Cache {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Cache) : {};
}

function writeCache(path: string, cache: Cache): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(cache));
  renameSync(temp, path);
}

export async function findClips(songs: readonly SongToFind[], options: ClipSearchOptions): Promise<ClipSearchResult> {
  const { apiKey, cachePath, fetch: fetchFn = globalThis.fetch, maxSearches = Infinity, onProgress } = options;
  const redact = (text: string) => (apiKey ? text.split(apiKey).join("***") : text);
  const cache = readCache(cachePath);
  const todo = songs.filter((s) => !(s.id in cache));
  let searches = 0;
  let stoppedEarly = false;

  for (const song of todo) {
    if (searches >= maxSearches) {
      stoppedEarly = true;
      break;
    }
    const url = new URL(ENDPOINT);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("videoCategoryId", "10");
    url.searchParams.set("maxResults", "8");
    url.searchParams.set("q", `${song.artist} ${song.song} official video`);
    url.searchParams.set("fields", "items(id/videoId,snippet(title,channelTitle))");
    url.searchParams.set("key", apiKey);

    let response: Response;
    try {
      response = await fetchFn(url.toString());
    } catch (error) {
      throw new Error(`não foi possível falar com a YouTube Data API (${redact(error instanceof Error ? error.message : String(error))})`);
    }
    const body = (await response.json().catch(() => undefined)) as
      | { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[]; error?: { message?: string; errors?: { reason?: string }[] } }
      | undefined;
    if (!response.ok) {
      if (body?.error?.errors?.some((e) => e.reason === "quotaExceeded" || e.reason === "dailyLimitExceeded")) {
        stoppedEarly = true;
        break;
      }
      throw new Error(`a YouTube Data API respondeu HTTP ${response.status}: ${redact(body?.error?.message ?? "sem detalhes")}`);
    }
    searches++;
    const results: SearchResult[] = (body?.items ?? []).flatMap((item) =>
      item.id?.videoId && item.snippet?.title ? [{ videoId: item.id.videoId, title: item.snippet.title, channelTitle: item.snippet.channelTitle ?? "" }] : [],
    );
    const clip = pickClip(results, song);
    cache[song.id] = clip ? { videoId: clip.videoId } : { none: true };
    writeCache(cachePath, cache);
    onProgress?.(searches, todo.length);
  }

  const clips = new Map<string, string>();
  let withoutClip = 0;
  for (const song of songs) {
    const entry = cache[song.id];
    if (!entry) continue;
    if ("videoId" in entry) clips.set(song.id, entry.videoId);
    else withoutClip++;
  }
  return { clips, withoutClip, pending: stoppedEarly ? songs.filter((s) => !(s.id in cache)).length : 0, searches };
}
