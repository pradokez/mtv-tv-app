import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const snapshotPath = fileURLToPath(new URL("./public/catalog.json", import.meta.url));
const examplePath = fileURLToPath(new URL("./fixtures/catalog.example.json", import.meta.url));

/**
 * The real snapshot (`public/catalog.json`, made by `pnpm catalog`) is never
 * committed. Without it, dev and build fall back to the small example catalog
 * so a fresh clone still plays something.
 */
function catalogFallback(): Plugin {
  return {
    name: "catalog-fallback",
    configureServer(server) {
      server.middlewares.use("/catalog.json", (_req, res, next) => {
        if (existsSync(snapshotPath)) return next();
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(examplePath));
      });
    },
    generateBundle() {
      if (existsSync(snapshotPath)) return;
      this.emitFile({ type: "asset", fileName: "catalog.json", source: readFileSync(examplePath) });
    },
  };
}

// `base: "./"` keeps asset paths relative so the build works when the
// Android shell serves `web/dist/` through WebViewAssetLoader.
export default defineConfig({
  base: "./",
  plugins: [catalogFallback()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
