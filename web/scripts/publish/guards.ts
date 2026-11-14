/**
 * Guards of `pnpm publish:site`: each one throws `PublishError` with a message
 * in Portuguese when the site would go out without the real catalog, outside
 * the secret path or indexable by search engines.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseCatalog, type Catalog } from "../../src/catalog/catalog.ts";

/** Well below the real snapshot (~111 channels, ~107 thousand videos), well above the example. */
const MIN_CHANNELS = 10;
const MIN_VIDEOS = 1000;

export class PublishError extends Error {
  override name = "PublishError";
}

/** `text` is the content of `public/catalog.json`, `undefined` when it is missing. */
export function checkCatalog(text: string | undefined, exampleText: string): void {
  if (text === undefined) {
    throw new PublishError("catálogo real não encontrado em public/catalog.json: rode `pnpm catalog` antes");
  }
  const data = parseJson(text);
  if (isDeepStrictEqual(data, parseJson(exampleText))) {
    throw new PublishError("public/catalog.json é o catálogo de exemplo: rode `pnpm catalog` para gerar o real");
  }
  let catalog: Catalog;
  try {
    catalog = parseCatalog(data);
  } catch (error) {
    throw new PublishError(`public/catalog.json inválido: ${(error as Error).message}`);
  }
  const channels = catalog.channels();
  const videos = new Set(channels.flatMap((c) => c.videoIds)).size;
  if (channels.length < MIN_CHANNELS || videos < MIN_VIDEOS) {
    throw new PublishError(
      `public/catalog.json tem só ${channels.length} canais e ${videos} vídeos ` +
        `(o real tem ao menos ${MIN_CHANNELS} canais e ${MIN_VIDEOS} vídeos): rode \`pnpm catalog\``,
    );
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new PublishError("public/catalog.json não é um JSON válido");
  }
}

/**
 * The secret path the app is published under. Letters, digits, `_` and `-`
 * only (safe in a URL), and long enough that it cannot be guessed.
 */
export function checkToken(token: string | undefined): string {
  if (!token) {
    throw new PublishError(
      "defina PUBLISH_TOKEN (em web/.publish.local ou na variável de ambiente) com o caminho secreto do site",
    );
  }
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    throw new PublishError(
      "PUBLISH_TOKEN deve ter ao menos 32 caracteres, só letras, dígitos, _ e - (ex.: openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')",
    );
  }
  return token;
}

/** `<meta name="robots" content="noindex...">`, in any attribute order. */
const NOINDEX_META = /<meta\s+(?=[^>]*name=["']robots["'])(?=[^>]*content=["'][^"']*noindex)[^>]*>/i;

/**
 * Checks the folder about to be uploaded (`dist-publish/`): the app only under
 * `<token>/`, `noindex` by header (`_headers`) and by meta tag, no
 * `robots.txt` (it would list the secret path) and the real catalog.
 */
export function checkStaged(dir: string, token: string, exampleText: string): void {
  const appDir = join(dir, token);
  const index = join(appDir, "index.html");
  if (!existsSync(index)) {
    throw new PublishError(`o app não está no caminho secreto: falta ${token.slice(0, 4)}…/index.html`);
  }
  const outside = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(
    (file) => file.endsWith("index.html") && !file.startsWith(`${token}/`),
  );
  if (outside.length > 0) {
    throw new PublishError(`index.html fora do caminho secreto: ${outside.join(", ")}`);
  }
  if (existsSync(join(dir, "robots.txt"))) {
    throw new PublishError("robots.txt no site publicado revelaria o caminho secreto: remova-o");
  }

  const headersFile = join(dir, "_headers");
  if (!existsSync(headersFile)) throw new PublishError("falta o arquivo _headers com o cabeçalho noindex");
  if (!/^\/\*\s*\n\s+X-Robots-Tag:\s*noindex/im.test(readFileSync(headersFile, "utf8"))) {
    throw new PublishError("_headers deve aplicar `X-Robots-Tag: noindex` a todas as páginas (/*)");
  }

  const html = readFileSync(index, "utf8");
  if (!NOINDEX_META.test(html)) throw new PublishError("index.html sem a meta robots noindex");
  // `/assets/...` would load from the site root, outside the secret path.
  if (/(?:src|href)=["']\/(?!\/)/.test(html)) {
    throw new PublishError("index.html carrega arquivos por caminho absoluto (/...): o build deve usar caminhos relativos");
  }

  const catalog = join(appDir, "catalog.json");
  checkCatalog(existsSync(catalog) ? readFileSync(catalog, "utf8") : undefined, exampleText);
}
