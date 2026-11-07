/**
 * `pnpm catalog`: downloads the site's public data and writes the catalog
 * snapshot to `public/catalog.json` (git-ignored: the curation is the site
 * creator's and is never committed).
 *
 * This is the only place in the project that talks to the site, and only when
 * run by hand. It fetches the three static files below and nothing else (no
 * counter or telemetry endpoints).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build, noMetaLookup, type SearchEntry } from "./build.ts";
import { parseChannelConfig } from "./channel-config.ts";
import { formatReport } from "./report.ts";

const SITE = "https://wantmymtv.org";
const SOURCES = {
  playlists: `${SITE}/public/mtv-playlists.json`,
  channelConfig: `${SITE}/channels-config.js`,
  searchIndex: `${SITE}/search-index.json`,
};
const OUTPUT = fileURLToPath(new URL("../../public/catalog.json", import.meta.url));

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
  console.log("Baixando playlists, configuração de canais e índice de busca…");
  const [playlists, channelConfig, searchIndex] = await Promise.all([
    download(SOURCES.playlists).then(parsePlaylists),
    download(SOURCES.channelConfig).then(parseChannelConfig),
    download(SOURCES.searchIndex).then(parseSearchIndex),
  ]);

  const { catalog, report } = await build({
    playlists,
    channelConfig,
    searchIndex,
    metaLookup: noMetaLookup,
    generatedAt: new Date().toISOString(),
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
