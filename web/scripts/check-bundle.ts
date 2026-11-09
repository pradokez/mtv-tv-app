/**
 * `node scripts/check-bundle.ts <dir>`: fails (exit 1) when the built JS or
 * CSS under `<dir>` uses syntax above the Samsung Q80's Chromium 69.
 *
 * Run by `pnpm build:tizen` on `dist-tizen/`, so a transform that silently
 * stops lowering something (or a new dependency shipped untranspiled) breaks
 * the build instead of a black screen on the TV.
 *
 * JS is parsed with acorn as ES2020 and then ES2020 syntax Chromium 69 lacks
 * (`?.`, `??`, BigInt literals) is rejected; anything newer (class fields,
 * `??=`, ...) fails to parse at all. `import()` and `import.meta` are fine.
 *
 * CSS is checked only for what the `chrome69` CSS target is supposed to
 * rewrite. Flex `gap` and `backdrop-filter` have no conversion and are tracked
 * in `docs/chromium69-apis.md`, so they do not fail the check.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse, type Node } from "acorn";

export type Violation = {
  line: number;
  column: number;
  message: string;
};

export function checkJs(source: string): Violation[] {
  let ast: Node;
  try {
    ast = parse(source, { ecmaVersion: 2020, sourceType: "module", locations: true });
  } catch (error) {
    const loc = (error as { loc?: { line: number; column: number } }).loc;
    return [
      {
        line: loc?.line ?? 0,
        column: loc?.column ?? 0,
        message: `sintaxe acima do ES2020: ${(error as Error).message}`,
      },
    ];
  }

  const violations: Violation[] = [];
  walk(ast, (node) => {
    const message = jsViolation(node);
    if (message && node.loc) {
      violations.push({ line: node.loc.start.line, column: node.loc.start.column, message });
    }
  });
  return violations;
}

function jsViolation(node: Node): string | undefined {
  if (node.type === "ChainExpression") return "optional chaining (?.)";
  if (node.type === "LogicalExpression" && (node as Node & { operator: string }).operator === "??") {
    return "nullish coalescing (??)";
  }
  if (node.type === "Literal" && "bigint" in node) return "literal BigInt";
  return undefined;
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) walk(item, visit);
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

/** CSS the `chrome69` target should have rewritten; seeing it means it did not. */
const CSS_RULES: { pattern: RegExp; message: string }[] = [
  { pattern: /(?<=[{;]\s*)inset\s*:/g, message: "propriedade inset (Chromium 87)" },
  { pattern: /(?<=[{;]\s*)aspect-ratio\s*:/g, message: "propriedade aspect-ratio (Chromium 88)" },
  { pattern: /:is\(/g, message: "seletor :is() (Chromium 88)" },
  { pattern: /:where\(/g, message: "seletor :where() (Chromium 88)" },
  { pattern: /:has\(/g, message: "seletor :has() (Chromium 105)" },
  { pattern: /@layer\b/g, message: "@layer (Chromium 99)" },
];

export function checkCss(source: string): Violation[] {
  // Blank out comments, keeping offsets, so commented-out CSS does not count.
  const css = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const violations: Violation[] = [];
  for (const { pattern, message } of CSS_RULES) {
    for (const match of css.matchAll(pattern)) {
      violations.push({ ...position(css, match.index), message });
    }
  }
  return violations.sort((a, b) => a.line - b.line || a.column - b.column);
}

function position(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  return { line, column: index - (before.lastIndexOf("\n") + 1) };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
    .map((file) => join(dir, file))
    .sort();
}

function main(dir: string | undefined): number {
  if (!dir) {
    console.error("Uso: node scripts/check-bundle.ts <pasta do build>");
    return 1;
  }
  const files = existsSync(dir) ? listFiles(dir) : [];
  if (files.length === 0) {
    console.error(`Nenhum .js ou .css em ${dir}: o build rodou?`);
    return 1;
  }

  let total = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const violations = file.endsWith(".js") ? checkJs(source) : checkCss(source);
    for (const v of violations) {
      console.error(`${relative(process.cwd(), file)}:${v.line}:${v.column + 1} ${v.message}`);
    }
    total += violations.length;
  }

  if (total > 0) {
    console.error(`\n${total} uso(s) acima do Chromium 69 em ${dir}.`);
    return 1;
  }
  console.log(`Bundle compatível com Chromium 69 (${files.length} arquivos em ${dir}).`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = main(process.argv[2]);
}
