import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_CONFIG_PATH,
  LOCAL_CONFIG_PATH,
  hostedUrl,
  loadHostedConfig,
  renderTizenConfig,
  tizenOptionsFor,
} from "./hosted-config.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const cli = fileURLToPath(new URL("./hosted-config.ts", import.meta.url));
const template = readFileSync(join(repoRoot, "tizen", "config.template.xml"), "utf8");

function writeConfig(content: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "hosted-")), "hosted.local.json");
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

const sample = { domain: "meu-app.pages.dev", token: "s3gr3d0-abc" };

describe("hosted URL", () => {
  it("joins domain and token into an https URL", () => {
    expect(hostedUrl(sample)).toBe("https://meu-app.pages.dev/s3gr3d0-abc/");
  });

  it("is what the Android build receives", () => {
    const out = execFileSync("node", [cli, "android-url"], {
      env: { ...process.env, HOSTED_CONFIG_PATH: writeConfig(sample) },
    }).toString();
    expect(out).toBe(hostedUrl(sample));
  });

  it("makes the Android build fail with a clear message when the file is missing", () => {
    let stderr = "";
    try {
      execFileSync("node", [cli, "android-url"], {
        env: { ...process.env, HOSTED_CONFIG_PATH: "/nao/existe.json" },
        stdio: "pipe",
      });
    } catch (error) {
      stderr = String((error as { stderr: Buffer }).stderr);
    }
    expect(stderr).toMatch(/hosted\.example\.json/);
  });
});

describe("loadHostedConfig", () => {
  it("reads domain and token", () => {
    expect(loadHostedConfig(writeConfig(sample))).toEqual(sample);
  });

  it("fails with a clear message when the local file is missing", () => {
    expect(() => loadHostedConfig("/nao/existe/hosted.local.json")).toThrow(/hosted\.example\.json/);
  });

  it.each([
    ["domain with scheme", { ...sample, domain: "https://meu-app.pages.dev" }, /domain/],
    ["domain with path", { ...sample, domain: "meu-app.pages.dev/x" }, /domain/],
    ["missing token", { domain: sample.domain }, /token/],
    ["token with slash", { ...sample, token: "a/b" }, /token/],
    ["invalid JSON", "{nope", /JSON/],
  ])("rejects %s", (_name, content, message) => {
    expect(() => loadHostedConfig(writeConfig(content))).toThrow(message);
  });

  it("accepts the versioned example", () => {
    expect(() => loadHostedConfig(EXAMPLE_CONFIG_PATH)).not.toThrow();
  });
});

describe("generated Tizen config.xml", () => {
  const xml = renderTizenConfig(template, tizenOptionsFor(sample));

  it("points content src at the hosted URL", () => {
    expect(xml).toContain('<content src="https://meu-app.pages.dev/s3gr3d0-abc/"/>');
  });

  it("restricts access to the hosted domain and YouTube, never *", () => {
    const origins = [...xml.matchAll(/<access origin="([^"]+)"/g)].map((m) => m[1]);
    expect(origins).toContain("https://meu-app.pages.dev");
    expect(origins).toContain("https://www.youtube.com");
    expect(origins).not.toContain("*");
    expect(origins.every((o) => o?.startsWith("https://"))).toBe(true);
  });

  it("keeps the secret token out of <access>", () => {
    expect(xml.match(/<access[^>]*>/g)!.join("")).not.toContain(sample.token);
  });

  it("leaves no placeholder behind", () => {
    expect(xml).not.toMatch(/__[A-Z_]+__/);
  });
});

describe("the secret URL stays out of git", () => {
  const tracked = (): string[] =>
    execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot }).toString().split("\0").filter(Boolean);

  it("ignores the local config file", () => {
    expect(() => execFileSync("git", ["check-ignore", "-q", "config/hosted.local.json"], { cwd: repoRoot })).not.toThrow();
    expect(tracked()).not.toContain("config/hosted.local.json");
  });

  it.skipIf(!existsSync(LOCAL_CONFIG_PATH))("appears in no versioned file", () => {
    const { domain, token } = loadHostedConfig();
    const offenders = tracked().filter((file) => {
      const content = readFileSync(join(repoRoot, file));
      return content.includes(token) || content.includes(domain);
    });
    expect(offenders).toEqual([]);
  });
});
