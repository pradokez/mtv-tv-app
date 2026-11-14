// Shared by the publish tests.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** A valid catalog with `channels` channels of `perChannel` videos each. */
export function fakeCatalog(channels: number, perChannel: number): string {
  const videos: Record<string, { durationSec: number }> = {};
  const list = Array.from({ length: channels }, (_, c) => {
    const videoIds = Array.from({ length: perChannel }, (_, v) => `c${c}v${v}`);
    for (const id of videoIds) videos[id] = { durationSec: 200 };
    return { id: `c${c}`, name: `Canal ${c}`, icon: "📺", order: c, videoIds };
  });
  return JSON.stringify({ schemaVersion: 1, channels: list, videos });
}

/** Writes `files` (relative path → content) under `dir`, creating folders. */
export function writeTree(dir: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

export const TOKEN = "Xk3_9-qv7LpZ2mN8rT4wY6bC1dF5gH0j";

/** What `stage` writes for `TOKEN`: what `checkStaged` accepts. */
export function stagedTree(token = TOKEN): Record<string, string> {
  return {
    "_headers": "/*\n  X-Robots-Tag: noindex, nofollow\n",
    "404.html": '<!doctype html><meta name="robots" content="noindex, nofollow"><title>404</title>',
    [`${token}/index.html`]:
      '<!doctype html><html><head><meta name="robots" content="noindex, nofollow"><script defer src="./assets/index.js"></script></head></html>',
    [`${token}/assets/index.js`]: "console.log(1);",
    [`${token}/catalog.json`]: fakeCatalog(20, 100),
  };
}
