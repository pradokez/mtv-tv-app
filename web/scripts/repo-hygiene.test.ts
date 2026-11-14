import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The repository is public: nothing from the environment (private IPs, API
// keys, private keys) may be versioned. They live in env vars or git-ignored
// local files. The patterns are assembled from pieces so this file does not
// match itself.
const root = join(fileURLToPath(new URL("../..", import.meta.url)));
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const octet = "(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)";
const rest = `\\.${octet}\\.${octet}`;
const FORBIDDEN: Record<string, RegExp> = {
  "private IP (192.168.*)": new RegExp(`(?<![\\d.])192\\.168${rest}(?![\\d.])`),
  "private IP (10.*)": new RegExp(`(?<![\\d.])10\\.${octet}${rest}(?![\\d.])`),
  "private IP (172.16-31.*)": new RegExp(`(?<![\\d.])172\\.(?:1[6-9]|2\\d|3[01])${rest}(?![\\d.])`),
  "Google API key": new RegExp("AI" + "za[0-9A-Za-z_-]{35}"),
  "GitHub token": new RegExp("gh[pousr]" + "_[0-9A-Za-z]{36,}"),
  "Cloudflare token": new RegExp("cf" + "ut_[0-9A-Za-z]{20,}"),
  "private key": new RegExp("-----BEGIN [A-Z ]*PRIVATE" + " KEY-----"),
};

const files = git("ls-files", "-z", "--full-name", ":/")
  .split("\0")
  .filter(Boolean)
  .filter((f) => !/\.(png|jpe?g|gif|webp|ico|woff2?|jar)$/i.test(f));

const find = (re: RegExp) =>
  files.flatMap((file) => {
    let text: string;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      return [];
    }
    return text.split("\n").flatMap((line, i) => (re.test(line) ? [`${file}:${i + 1}`] : []));
  });

describe("repository hygiene", () => {
  it.each(Object.entries(FORBIDDEN))("no versioned file contains a %s", (_name, re) => {
    expect(find(re)).toEqual([]);
  });

  it.each([".env", ".env.local", ".env.production"])("git ignores %s", (path) => {
    expect(git("check-ignore", path).trim()).toBe(path);
  });

  it("detects what it is meant to detect", () => {
    expect(FORBIDDEN["private IP (192.168.*)"]!.test("ip 192.168.0.13:5555")).toBe(true);
    expect(FORBIDDEN["private IP (10.*)"]!.test("10.0.0.7")).toBe(true);
    expect(FORBIDDEN["private IP (172.16-31.*)"]!.test("172.20.1.1")).toBe(true);
    expect(FORBIDDEN["private IP (172.16-31.*)"]!.test("172.32.1.1")).toBe(false);
    expect(FORBIDDEN["private IP (10.*)"]!.test("version 110.0.0.1")).toBe(false);
  });
});
