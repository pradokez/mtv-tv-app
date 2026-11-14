/**
 * Guards of `pnpm publish:site`: each one throws `PublishError` with a message
 * in Portuguese when the site would go out without the real catalog.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseCatalog, type Catalog } from "../../src/catalog/catalog.ts";

/** Well below the real snapshot (~111 channels, ~107 thousand videos), well above the example. */
const MIN_CHANNELS = 10;
const MIN_VIDEOS = 1000;

export class PublishError extends Error {
  override name = "PublishError";
}

/** The file's text, `undefined` when it does not exist. */
export function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/**
 * `text` is the content of the catalog file `name` (`public/catalog.json` by
 * default), `undefined` when it is missing.
 */
export function checkCatalog(text: string | undefined, exampleText: string, name = "public/catalog.json"): void {
  if (text === undefined) {
    throw new PublishError(`catálogo real não encontrado em ${name}: rode \`pnpm catalog\` antes`);
  }
  const data = parseJson(text, name);
  if (isDeepStrictEqual(data, parseJson(exampleText, "fixtures/catalog.example.json"))) {
    throw new PublishError(`${name} é o catálogo de exemplo: rode \`pnpm catalog\` para gerar o real`);
  }
  let catalog: Catalog;
  try {
    catalog = parseCatalog(data);
  } catch (error) {
    throw new PublishError(`${name} inválido: ${(error as Error).message}`);
  }
  const channels = catalog.channels();
  const videos = new Set(channels.flatMap((c) => c.videoIds)).size;
  if (channels.length < MIN_CHANNELS || videos < MIN_VIDEOS) {
    throw new PublishError(
      `${name} tem só ${channels.length} canais e ${videos} vídeos ` +
        `(o real tem ao menos ${MIN_CHANNELS} canais e ${MIN_VIDEOS} vídeos): rode \`pnpm catalog\``,
    );
  }
}

function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new PublishError(`${name} não é um JSON válido`);
  }
}

/**
 * Checks the folder about to be uploaded (`dist-tizen/`): the app at its root
 * and the real catalog next to it (vite ships the example when the real one
 * is missing).
 */
export function checkBuild(dir: string, exampleText: string): void {
  if (!existsSync(join(dir, "index.html"))) {
    throw new PublishError(`${join(dir, "index.html")} não existe: o build não gerou o app`);
  }
  const catalog = join(dir, "catalog.json");
  checkCatalog(readIfExists(catalog), exampleText, catalog);
}
