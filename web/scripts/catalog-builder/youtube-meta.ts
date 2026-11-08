/**
 * Duration and embed status of each video, from the YouTube Data API
 * (`videos.list`, 1 quota unit per call of up to 50 ids).
 *
 * Answers are cached on disk and the cache is written after every batch, so
 * a run that stops halfway (quota, network) resumes where it left off and
 * later runs only query ids never seen before. The API key goes only into the
 * request URL: it is never logged, put in an error message or cached.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DISCARD_REASONS, type DiscardReason, type MetaLookup, type VideoLookup } from "./build.ts";

const ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
/** The most ids `videos.list` accepts per call. */
const MAX_BATCH = 50;

export interface YouTubeMetaOptions {
  apiKey: string;
  /** JSON file `{ id: { durationSec } | { discard } }`, created if missing. */
  cachePath: string;
  fetch?: (url: string) => Promise<Response>;
  batchSize?: number;
  /** Called after each batch with how many uncached ids are done so far. */
  onProgress?: (done: number, total: number) => void;
}

type Cache = Map<string, VideoLookup>;

interface ApiVideo {
  id?: string;
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
}

export function createYouTubeMetaLookup(options: YouTubeMetaOptions): MetaLookup {
  const { apiKey, cachePath, fetch = globalThis.fetch, onProgress } = options;
  const batchSize = Math.min(options.batchSize ?? MAX_BATCH, MAX_BATCH);
  const redact = (text: string) => (apiKey ? text.split(apiKey).join("***") : text);

  async function fetchBatch(batch: readonly string[]): Promise<ApiVideo[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set("part", "contentDetails,status");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("maxResults", String(MAX_BATCH));
    // Only the fields we read: smaller answers, same quota.
    url.searchParams.set("fields", "items(id,contentDetails/duration,status(embeddable,privacyStatus))");
    url.searchParams.set("key", apiKey);

    let response: Response;
    try {
      response = await fetch(url.toString());
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`não foi possível falar com a YouTube Data API (${redact(detail)})`);
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new Error(`a YouTube Data API respondeu HTTP ${response.status}: ${redact(apiErrorMessage(body))}`);
    }
    const items = (body as { items?: unknown } | undefined)?.items;
    if (!Array.isArray(items)) throw new Error("a YouTube Data API respondeu em formato inesperado (sem items)");
    return items as ApiVideo[];
  }

  return async (ids) => {
    const cache = readCache(cachePath);
    const pending = [...new Set(ids)].filter((id) => !cache.has(id));
    let quotaUnits = 0;
    for (let start = 0; start < pending.length; start += batchSize) {
      const batch = pending.slice(start, start + batchSize);
      const items = await fetchBatch(batch);
      quotaUnits++;
      const byId = new Map(items.map((item) => [item.id, item]));
      for (const id of batch) cache.set(id, toLookup(byId.get(id)));
      writeCache(cachePath, cache);
      onProgress?.(start + batch.length, pending.length);
    }

    const found = new Map<string, VideoLookup>();
    for (const id of ids) {
      const entry = cache.get(id);
      if (entry) found.set(id, entry);
    }
    return { found, quotaUnits };
  };
}

/** Seconds in an ISO 8601 duration as YouTube writes it (`PT1H2M3S`, `P1DT2S`, `P0D`). */
export function parseIsoDuration(iso: string): number | undefined {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!match || iso === "P" || iso.endsWith("T")) return undefined;
  const [days, hours, minutes, seconds] = match.slice(1).map((n) => Number(n ?? 0)) as [number, number, number, number];
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

/** A video missing from the answer was removed or made private. */
function toLookup(video: ApiVideo | undefined): VideoLookup {
  if (!video || video.status?.privacyStatus === "private") return { discard: "privado ou removido" };
  if (video.status?.embeddable === false) return { discard: "não embutível" };
  const durationSec = parseIsoDuration(video.contentDetails?.duration ?? "");
  // Live streams and premieres report P0D.
  if (!durationSec) return { discard: "sem duração" };
  return { durationSec };
}

function apiErrorMessage(body: unknown): string {
  const message = (body as { error?: { message?: unknown } } | undefined)?.error?.message;
  return typeof message === "string" ? message : "sem detalhes";
}

function readCache(path: string): Cache {
  if (!existsSync(path)) return new Map();
  const corrupt = () =>
    new Error(`cache da YouTube Data API corrompido em ${path}; apague o arquivo para consultar tudo de novo`);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw corrupt();
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw corrupt();
  return new Map(Object.entries(data).filter((pair): pair is [string, VideoLookup] => isLookup(pair[1])));
}

function isLookup(entry: unknown): entry is VideoLookup {
  if (typeof entry !== "object" || entry === null) return false;
  const { durationSec, discard } = entry as { durationSec?: unknown; discard?: unknown };
  return (
    (typeof durationSec === "number" && durationSec > 0) || DISCARD_REASONS.includes(discard as DiscardReason)
  );
}

/** Write to a temporary file, then rename: an interrupted write never leaves half a cache. */
function writeCache(path: string, cache: Cache): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(cache)));
  renameSync(tmp, path);
}
