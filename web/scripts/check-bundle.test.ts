import { fileURLToPath } from "node:url";
import { build, type Rollup } from "vite";
import { describe, expect, it } from "vitest";
import { checkCss, checkJs, type Violation } from "./check-bundle.ts";

describe("checkJs", () => {
  it.each([
    ["optional chaining", "const x = a?.b;", "optional chaining (?.)"],
    ["optional call", "a.b?.();", "optional chaining (?.)"],
    ["nullish coalescing", "const x = a ?? b;", "nullish coalescing (??)"],
  ])("rejects %s", (_name, source, message) => {
    expect(checkJs(source)).toEqual([expect.objectContaining({ line: 1, message })]);
  });

  it.each([
    ["logical nullish assignment", "a ??= b;"],
    ["class fields", "class A { x = 1; }"],
    ["private methods", "class A { #m() {} }"],
    ["top-level await", "await Promise.resolve();"],
  ])("rejects %s as a parse error", (_name, source) => {
    const violations = checkJs(source);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toMatch(/^sintaxe acima do ES2020/);
  });

  it("reports the line of each violation", () => {
    expect(checkJs("const a = 1;\nconst b = a?.c;\nconst d = b ?? 2;").map((v) => v.line)).toEqual([2, 3]);
  });

  it("accepts ES2018 and what Chromium 69 has from later versions", () => {
    const source = [
      "const { a, ...rest } = obj;",
      "const copy = { ...rest, b: 1 };",
      "async function* gen() { for await (const x of xs) yield x; }",
      "const re = /(?<year>\\d{4})/su;",
      "try { f(); } catch { g(); }",
      "const ternary = ok ? .5 : 1;",
      "const big = 10n;",
      "import(\"./chunk.js\");",
      "const url = new URL(\"a\", import.meta.url);",
      "export { gen };",
    ].join("\n");

    expect(checkJs(source)).toEqual([]);
  });
});

describe("checkCss", () => {
  it("rejects inset with its position", () => {
    expect(checkCss(".a{color:red}\n.b{position:fixed;inset: 0}")).toEqual([
      { line: 2, column: 18, message: "propriedade inset (Chromium 87)" },
    ]);
  });

  it.each([
    [".a{aspect-ratio:16/9}", "propriedade aspect-ratio (Chromium 88)"],
    [":is(.a,.b) .c{color:red}", "seletor :is() (Chromium 88)"],
    [":where(.a){color:red}", "seletor :where() (Chromium 88)"],
    [".a:has(.b){color:red}", "seletor :has() (Chromium 105)"],
    ["@layer base{.a{color:red}}", "@layer (Chromium 99)"],
  ])("rejects %s", (source, message) => {
    expect(checkCss(source)).toEqual([expect.objectContaining({ message })]);
  });

  it("accepts look-alikes and what is tracked elsewhere", () => {
    const source = [
      ".a{box-shadow:inset 0 0 0 1px red}",
      "@media (min-aspect-ratio:16/9){.b{top:0;right:0;bottom:0;left:0}}",
      ".c{display:flex;gap:1rem;backdrop-filter:blur(6px)}",
      "/* .d{inset:0} */",
    ].join("\n");

    expect(checkCss(source)).toEqual([]);
  });
});

describe("app bundle", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));

  /** Builds in memory (nothing written to disk) and checks every JS and CSS file. */
  async function violations(mode: string): Promise<{ js: Violation[]; css: Violation[] }> {
    const result = (await build({ root, mode, logLevel: "silent", build: { write: false } })) as Rollup.RollupOutput;
    const js: Violation[] = [];
    const css: Violation[] = [];
    for (const file of result.output) {
      if (file.type === "chunk") js.push(...checkJs(file.code));
      else if (file.fileName.endsWith(".css")) css.push(...checkCss(String(file.source)));
    }
    return { js, css };
  }

  it("fails for the default build, which keeps syntax above Chromium 69", async () => {
    const { js, css } = await violations("production");

    expect(js.length).toBeGreaterThan(0);
    expect(css.length).toBeGreaterThan(0);
  });

  it("passes for the tizen build", async () => {
    expect(await violations("tizen")).toEqual({ js: [], css: [] });
  });

  /** The built `index.html`, in memory. */
  async function indexHtml(mode: string): Promise<string> {
    const result = (await build({ root, mode, logLevel: "silent", build: { write: false } })) as Rollup.RollupOutput;
    const html = result.output.find((file) => file.fileName === "index.html");
    return html?.type === "asset" ? String(html.source) : "";
  }

  it("loads the tizen build as a classic script, which file:// on the Q80 requires", async () => {
    const html = await indexHtml("tizen");

    expect(html).toMatch(/<script defer src="\.\/assets\/[^"]+\.js"><\/script>/);
    expect(html).toMatch(/<link rel="stylesheet" href="\.\/assets\/[^"]+\.css">/);
    expect(html).not.toContain('type="module"');
    expect(html).not.toContain("crossorigin");
  });

  it("keeps the module script in the default build", async () => {
    expect(await indexHtml("production")).toContain('<script type="module" crossorigin');
  });
});
