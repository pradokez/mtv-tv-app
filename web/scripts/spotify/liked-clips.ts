/**
 * The local file `curadoria/spotify-clipes.local.json` (git-ignored: it lists
 * the user's liked songs): the YouTube clip of each liked song, with the year
 * and artist genres that categorize it. The Catalog Builder reads it and, with
 * the rules in `curadoria/generos-canais.json`, turns it into `LikedClip`s.
 */
import type { LikedClip } from "../catalog-builder/build.ts";
import { classify, type GenreRule } from "./classify.ts";

export interface StoredClip {
  /** YouTube video id of the clip. */
  id: string;
  artist: string;
  song: string;
  year?: number;
  genres: string[];
}

export class LikedClipsError extends Error {
  override name = "LikedClipsError";
}

export function parseLikedClips(text: string): StoredClip[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new LikedClipsError("o arquivo de clipes das curtidas não é um JSON válido");
  }
  const list = typeof data === "object" && data !== null ? (data as { clips?: unknown }).clips : undefined;
  if (!Array.isArray(list)) throw new LikedClipsError('o arquivo de clipes das curtidas deveria ser { "clips": [...] }');
  return list.map((raw: unknown, index) => {
    const c = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const where = `clipe na posição ${index}`;
    if (typeof c.id !== "string" || typeof c.artist !== "string" || typeof c.song !== "string") throw new LikedClipsError(`${where} inválido (esperava id, artist e song)`);
    if (c.year !== undefined && !Number.isInteger(c.year)) throw new LikedClipsError(`${where}: year deveria ser um número inteiro`);
    if (!Array.isArray(c.genres) || !c.genres.every((g) => typeof g === "string")) throw new LikedClipsError(`${where}: genres deveria ser uma lista de textos`);
    return { id: c.id, artist: c.artist, song: c.song, ...(c.year !== undefined ? { year: c.year as number } : {}), genres: c.genres as string[] };
  });
}

export function toLikedClips(stored: readonly StoredClip[], rules: readonly GenreRule[]): LikedClip[] {
  return stored.map((c) => ({ id: c.id, artist: c.artist, song: c.song, channels: classify({ ...(c.year !== undefined ? { year: c.year } : {}), genres: c.genres }, rules) }));
}
