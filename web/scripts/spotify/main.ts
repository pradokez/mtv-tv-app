/**
 * `pnpm spotify:likes`: logs in to Spotify and saves the liked songs (with
 * year; artist genres from MusicBrainz) to `.cache/spotify-likes.json`.
 * `pnpm spotify:clips`: looks for each liked song's clip on YouTube and writes
 * `curadoria/spotify-clipes.local.json`, which `pnpm catalog` merges into the
 * existing channels. Both files are git-ignored (they list the user's songs).
 *
 * Environment: SPOTIFY_CLIENT_ID (likes), YOUTUBE_API_KEY (clips),
 * SPOTIFY_MAX_SEARCHES (optional daily budget for clips; default 95).
 */
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupGenres } from "./musicbrainz.ts";
import { fetchLikedTracks, getAccessToken, type LikedTrack } from "./spotify.ts";
import { findClips } from "./youtube-search.ts";
import type { StoredClip } from "./liked-clips.ts";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const TOKEN = path("../../.cache/spotify-token.json");
const LIKES = path("../../.cache/spotify-likes.json");
const GENRE_CACHE = path("../../.cache/musicbrainz-genres.json");
const SEARCH_CACHE = path("../../.cache/youtube-search.json");
const OUTPUT = path("../../curadoria/spotify-clipes.local.json");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`defina ${name} (ex.: ${name}=... pnpm ${process.argv[2] === "likes" ? "spotify:likes" : "spotify:clips"})`);
  return value;
}

async function likes() {
  const token = await getAccessToken({
    clientId: required("SPOTIFY_CLIENT_ID"),
    tokenPath: TOKEN,
    openUrl: (url) => execFile("open", [url], () => {}),
  });
  console.log("Lendo as músicas curtidas…");
  const liked = await fetchLikedTracks(token);
  const names = [...new Set(liked.flatMap((t) => t.artistNames))];
  console.log(`${liked.length} músicas de ${names.length} artistas. Buscando gêneros no MusicBrainz (1 por segundo, com cache; pode levar alguns minutos)…`);
  const genres = await lookupGenres(names, {
    cachePath: GENRE_CACHE,
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) console.log(`Gêneros: ${done} de ${total} artistas novos`);
    },
  });
  const tracks = liked.map((t) => ({ ...t, genres: [...new Set(t.artistNames.flatMap((n) => genres.get(n) ?? []))] }));
  mkdirSync(dirname(LIKES), { recursive: true });
  writeFileSync(LIKES, JSON.stringify(tracks));
  const withGenres = tracks.filter((t) => t.genres.length > 0).length;
  console.log(`${tracks.length} músicas curtidas gravadas em ${LIKES} (${withGenres} com gêneros do artista).`);
}

async function clips() {
  const tracks = JSON.parse(readFileSync(LIKES, "utf8")) as LikedTrack[];
  const budget = Number(process.env.SPOTIFY_MAX_SEARCHES ?? 95);
  const result = await findClips(
    tracks.map((t) => ({ id: t.id, artist: t.artist, song: t.song })),
    {
      apiKey: required("YOUTUBE_API_KEY"),
      cachePath: SEARCH_CACHE,
      maxSearches: Number.isFinite(budget) ? budget : 95,
      onProgress: (done, total) => {
        if (done % 10 === 0 || done === total) console.log(`Buscas: ${done} de ${total} músicas novas`);
      },
    },
  );

  const stored: StoredClip[] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    const videoId = result.clips.get(t.id);
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    stored.push({ id: videoId, artist: t.artist, song: t.song, ...(t.year ? { year: t.year } : {}), genres: t.genres });
  }
  writeFileSync(OUTPUT, JSON.stringify({ clips: stored }, null, 2));
  console.log(
    [
      `Músicas curtidas: ${tracks.length}`,
      `Com clipe: ${stored.length}`,
      `Sem clipe (só áudio ou não achei): ${result.withoutClip}`,
      `Ainda por buscar: ${result.pending}${result.pending ? " (rode de novo amanhã: a cota diária do YouTube acabou ou o limite foi atingido)" : ""}`,
      `Gravado em ${OUTPUT}. Rode \`pnpm catalog\` para mesclar nos canais.`,
    ].join("\n"),
  );
}

const command = process.argv[2];
(command === "likes" ? likes() : command === "clips" ? clips() : Promise.reject(new Error("use: main.ts likes | clips"))).catch((error: unknown) => {
  console.error(`Falha: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
