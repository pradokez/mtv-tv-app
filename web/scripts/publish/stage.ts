/**
 * Builds the folder uploaded to Cloudflare Pages (`dist-publish/`) from the
 * tizen build: the app goes under `<token>/` and nothing is at the root but
 * the `noindex` header rules and a not-found page. Without an `index.html` at
 * the root, `https://<project>.pages.dev/` reveals nothing.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PublishError } from "./guards.ts";

/** Applied by Pages to every response, the app's files included. */
const HEADERS = "/*\n  X-Robots-Tag: noindex, nofollow\n";
const NOINDEX_META = '<meta name="robots" content="noindex, nofollow" />';
const NOT_FOUND = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    ${NOINDEX_META}
    <title>404</title>
  </head>
  <body></body>
</html>
`;

export function stage({ build, out, token }: { build: string; out: string; token: string }): void {
  const index = join(build, "index.html");
  if (!existsSync(index)) {
    throw new PublishError(`${index} não existe: rode \`pnpm build:tizen\` antes`);
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const app = join(out, token);
  cpSync(build, app, { recursive: true });

  const html = readFileSync(join(app, "index.html"), "utf8");
  writeFileSync(join(app, "index.html"), html.replace(/(\s*)<title>/, `$1${NOINDEX_META}$1<title>`));
  writeFileSync(join(out, "_headers"), HEADERS);
  writeFileSync(join(out, "404.html"), NOT_FOUND);
}
