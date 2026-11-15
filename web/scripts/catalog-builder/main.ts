/**
 * `pnpm catalog`: downloads the site's public data and writes the catalog
 * snapshot to `public/catalog.json` (git-ignored: the curation is the site
 * creator's and is never committed).
 *
 * This is the only place in the project that talks to the site, and only when
 * run by hand. It fetches the three static files below and nothing else (no
 * counter or telemetry endpoints).
 *
 * The commercials of the breaks between clips come from the hand-curated list
 * `curadoria/comerciais-br.json` (committed, unlike the snapshot).
 *
 * Channels the site does not have (e.g. Taylor Swift) come from the hand-curated
 * `curadoria/canais-proprios.json`, also committed.
 *
 * Durations and embed status come from the YouTube Data API, with the key in
 * the `YOUTUBE_API_KEY` environment variable. Answers are cached in
 * `.cache/youtube-meta.json` (git-ignored), so a run cut short by the quota
 * resumes where it stopped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type SearchEntry } from "./build.ts";
import { parseChannelConfig } from "./channel-config.ts";
import { parseCuratedCommercials } from "./commercials.ts";
import { parseOwnChannels } from "./own-channels.ts";
import { formatReport } from "./report.ts";
import { parseGenreRules } from "../spotify/classify.ts";
import { parseLikedClips, toLikedClips } from "../spotify/liked-clips.ts";
import { createYouTubeMetaLookup } from "./youtube-meta.ts";

const SITE = "https://wantmymtv.org";
const SOURCES = {
  playlists: `${SITE}/public/mtv-playlists.json`,
  channelConfig: `${SITE}/channels-config.js`,
  searchIndex: `${SITE}/search-index.json`,
};
const OUTPUT = fileURLToPath(new URL("../../public/catalog.json", import.meta.url));
const CURATED_COMMERCIALS = fileURLToPath(new URL("../../curadoria/comerciais-br.json", import.meta.url));
const OWN_CHANNELS = fileURLToPath(new URL("../../curadoria/canais-proprios.json", import.meta.url));
const LIKED_CLIPS = fileURLToPath(new URL("../../curadoria/spotify-clipes.local.json", import.meta.url));
const GENRE_RULES = fileURLToPath(new URL("../../curadoria/generos-canais.json", import.meta.url));
const META_CACHE = fileURLToPath(new URL("../../.cache/youtube-meta.json", import.meta.url));

async function download(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} respondeu HTTP ${response.status}`);
  return response.text();
}

function parsePlaylists(text: string): Record<string, string[]> {
  const data: unknown = JSON.parse(text);
  const valid =
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    Object.values(data).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string"));
  if (!valid) throw new Error("playlists em formato inesperado (esperava { canal: [ids] })");
  return data as Record<string, string[]>;
}

function parseSearchIndex(text: string): SearchEntry[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("índice de busca em formato inesperado (esperava uma lista)");
  return data.filter((e): e is SearchEntry => typeof e === "object" && e !== null && typeof e.id === "string");
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "defina YOUTUBE_API_KEY com uma chave da YouTube Data API v3 (ex.: YOUTUBE_API_KEY=... pnpm catalog)",
    );
  }

  const commercials = parseCuratedCommercials(readFileSync(CURATED_COMMERCIALS, "utf8"));

  const ownChannels = parseOwnChannels(readFileSync(OWN_CHANNELS, "utf8"));

  // Optional and local: the clips of the user's liked Spotify songs (`pnpm spotify:clips`).
  const likedClips = existsSync(LIKED_CLIPS)
    ? toLikedClips(parseLikedClips(readFileSync(LIKED_CLIPS, "utf8")), parseGenreRules(readFileSync(GENRE_RULES, "utf8")))
    : [];

  console.log("Baixando playlists, configuração de canais e índice de busca…");
  const [playlists, channelConfig, searchIndex] = await Promise.all([
    download(SOURCES.playlists).then(parsePlaylists),
    download(SOURCES.channelConfig).then(parseChannelConfig),
    download(SOURCES.searchIndex).then(parseSearchIndex),
  ]);

  console.log(`Consultando durações na YouTube Data API (o que já está em ${META_CACHE} não é consultado)…`);
  const { catalog, report } = await build({
    playlists,
    channelConfig,
    searchIndex,
    metaLookup: createYouTubeMetaLookup({
      apiKey,
      cachePath: META_CACHE,
      onProgress: (done, total) => {
        if (done === total || done % 5000 === 0) console.log(`Durações: ${done} de ${total} vídeos novos consultados`);
      },
    }),
    generatedAt: new Date().toISOString(),
    commercials,
    ownChannels,
    likedClips,
  });

  const json = JSON.stringify(catalog);
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, json);
  console.log(`\n${formatReport(report)}\n`);
  console.log(`Gravado em ${OUTPUT} (${(Buffer.byteLength(json) / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((error: unknown) => {
  console.error(`Falha ao gerar o catálogo: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
