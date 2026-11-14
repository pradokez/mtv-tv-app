import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// The app is served from the hosted site, so `'self'` means that domain. The
// CSP must let it talk to nobody else: only the site itself and the YouTube
// player may load code, frames or data.
const webRoot = fileURLToPath(new URL("..", import.meta.url));

function csp(htmlPath: string): Record<string, string[]> {
  const html = readFileSync(htmlPath, "utf8");
  const content = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1];
  if (!content) throw new Error(`sem CSP em ${htmlPath}`);
  return Object.fromEntries(
    content.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

const pages = [
  join(webRoot, "index.html"),
  join(webRoot, "dist", "index.html"),
  join(webRoot, "dist-tizen", "index.html"),
].filter(existsSync);

it.each(pages)("CSP of %s only allows the site itself and the YouTube player", (page) => {
  const policy = csp(page);

  expect(policy["default-src"]).toEqual(["'self'"]);
  expect(policy["connect-src"]).toEqual(["'self'"]);
  expect(policy["script-src"]).toEqual(["'self'", "https://www.youtube.com", "https://s.ytimg.com"]);
  expect(policy["frame-src"]).toEqual(["https://www.youtube.com", "https://www.youtube-nocookie.com"]);
  expect(policy["img-src"]).toEqual(["'self'", "data:", "https://i.ytimg.com"]);
  expect(policy["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);

  const every = Object.values(policy).flat();
  expect(every).not.toContain("*");
  expect(every).not.toContain("'unsafe-eval'");
  expect(every.filter((source) => /^https?:/.test(source) && !/youtube|ytimg/.test(source))).toEqual([]);
});
