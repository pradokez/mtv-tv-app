import { defineConfig } from "vitest/config";

// `base: "./"` keeps asset paths relative so the build works when the
// Android shell serves `web/dist/` through WebViewAssetLoader.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
  },
});
