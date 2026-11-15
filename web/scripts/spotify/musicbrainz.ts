/**
 * Artist genres from MusicBrainz (community tags), because Spotify no longer
 * gives them to new apps. One search per artist, at most one request per
 * second (MusicBrainz's rule), answered from a disk cache that is written
 * after every artist, so an interrupted run resumes where it stopped.
 * Only a name that matches the searched artist is trusted; otherwise the
 * artist has no genres and its songs keep just their decade.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ENDPOINT = "https://musicbrainz.org/ws/2/artist/";
const USER_AGENT = "mtv-tv-app/0.1 (personal project, genre lookup)";
/** Tags with fewer votes are noise. */
const MIN_VOTES = 1;
const MAX_GENRES = 8;

export interface GenreLookupOptions {
  /** JSON `{ normalizedArtistName: string[] }`, created if missing. */
  cachePath: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Pause between requests; MusicBrainz asks for at most 1 per second. */
  delayMs?: number;
  onProgress?: (done: number, total: number) => void;
}

const normalize = (name: string) =>
  name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

interface MbArtist {
  name?: string;
  score?: number;
  tags?: { name?: string; count?: number }[];
}

/** The tags of the search result that is this artist, best-voted first; empty when no result matches. */
export function genresFromSearch(artistName: string, artists: readonly MbArtist[]): string[] {
  const wanted = normalize(artistName);
  const match = artists.find((a) => (a.score ?? 0) >= 90 && a.name !== undefined && normalize(a.name) === wanted);
  return [...(match?.tags ?? [])]
    .filter((t): t is { name: string; count?: number } => typeof t.name === "string" && (t.count ?? 0) >= MIN_VOTES)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, MAX_GENRES)
    .map((t) => t.name.toLowerCase());
}

function readCache(path: string): Record<string, string[]> {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, string[]>) : {};
}

function writeCache(path: string, cache: Record<string, string[]>): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(cache));
  renameSync(temp, path);
}

/** Genres per artist name (as given). Artists MusicBrainz does not know map to an empty list. */
export async function lookupGenres(artistNames: readonly string[], options: GenreLookupOptions): Promise<Map<string, string[]>> {
  const { cachePath, fetch: fetchFn = globalThis.fetch, delayMs = 1100, onProgress } = options;
  const cache = readCache(cachePath);
  const names = [...new Set(artistNames)];
  const pending = names.filter((n) => !(normalize(n) in cache));

  for (const [index, name] of pending.entries()) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("query", `artist:"${name.replace(/["\\]/g, " ")}"`);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "5");
    let response = await fetchFn(url.toString(), { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    for (let retry = 0; (response.status === 503 || response.status === 429) && retry < 5; retry++) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * (retry + 1)));
      response = await fetchFn(url.toString(), { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    }
    if (!response.ok) throw new Error(`o MusicBrainz respondeu HTTP ${response.status} para "${name}"`);
    const body = (await response.json().catch(() => undefined)) as { artists?: MbArtist[] } | undefined;
    cache[normalize(name)] = genresFromSearch(name, body?.artists ?? []);
    writeCache(cachePath, cache);
    onProgress?.(index + 1, pending.length);
    if (index < pending.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return new Map(names.map((n) => [n, cache[normalize(n)] ?? []]));
}
