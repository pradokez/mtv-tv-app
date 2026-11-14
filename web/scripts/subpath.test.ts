import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// GitHub Pages serves the app under /<repo>/, not at the domain root. The build uses
// `base: "./"`, so every URL (assets and `fetch("./catalog.json")`) is relative; this
// serves a real build under a subpath and follows those URLs the way a browser does.

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const BASE_PATH = "/mtv-tv-app/";
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

let outDir: string;
let server: Server;
let origin: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "subpath-"));
  await build({ root: webRoot, logLevel: "silent", build: { outDir, emptyOutDir: true } });
  // Like GitHub Pages: files exist only under the base path; anything else is a 404.
  server = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    const relative = pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) || "index.html" : null;
    const file = relative && !relative.includes("..") ? join(outDir, relative) : null;
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(() => {
  server?.close();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe("app served under a subpath", () => {
  const pageUrl = () => new URL(BASE_PATH, origin);

  it("references scripts and styles relative to the page, never from the domain root", async () => {
    const html = await (await fetch(pageUrl())).text();
    const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1] as string);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.startsWith("/")).toBe(false);
      const response = await fetch(new URL(ref, pageUrl()));
      expect(response.status, ref).toBe(200);
    }
  });

  it("loads the catalog through the relative URL the app fetches", async () => {
    const main = readFileSync(join(webRoot, "src", "main.ts"), "utf8");
    const relative = /fetch\("(\.\/catalog\.json)"\)/.exec(main)?.[1];
    expect(relative).toBe("./catalog.json");

    const response = await fetch(new URL(relative as string, pageUrl()));
    expect(response.status).toBe(200);
    expect(Array.isArray((await response.json()).channels)).toBe(true);
  });

  it("is not served from the domain root (the test server is as strict as Pages)", async () => {
    expect((await fetch(new URL("/catalog.json", origin))).status).toBe(404);
  });
});
