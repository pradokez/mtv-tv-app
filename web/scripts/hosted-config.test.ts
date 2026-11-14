import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONFIG_PATH,
  hostedUrl,
  loadHostedConfig,
  renderTizenConfig,
  tizenOptionsFor,
} from "./hosted-config.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const cli = fileURLToPath(new URL("./hosted-config.ts", import.meta.url));
const template = readFileSync(join(repoRoot, "tizen", "config.template.xml"), "utf8");

function writeConfig(content: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "hosted-")), "hosted.json");
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

const sample = { domain: "meu-app.pages.dev" };

function runCli(args: string[], configPath: string): { status: number | null; stdout: string; stderr: string } {
  const { status, stdout, stderr } = spawnSync("node", [cli, ...args], {
    env: { ...process.env, HOSTED_CONFIG_PATH: configPath },
    encoding: "utf8",
  });
  return { status, stdout, stderr };
}

describe("hosted URL", () => {
  it("is the https root of the domain, with no secret path", () => {
    expect(hostedUrl(sample)).toBe("https://meu-app.pages.dev/");
  });

  it("is what the Android build receives", () => {
    const { status, stdout } = runCli(["android-url"], writeConfig(sample));
    expect(status).toBe(0);
    expect(stdout).toBe(hostedUrl(sample));
  });

  it("makes the Android build fail with a clear message when the file is missing", () => {
    const { status, stderr } = runCli(["android-url"], "/nao/existe.json");
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/config\/hosted\.json/);
  });
});

describe("tizen-config CLI (used by build-wgt.sh)", () => {
  it("prints the config.xml pointing at the hosted URL", () => {
    const { status, stdout } = runCli(["tizen-config"], writeConfig(sample));
    expect(status).toBe(0);
    expect(stdout).toBe(renderTizenConfig(template, tizenOptionsFor(sample)));
  });

  it("fails with a clear message when the file is missing", () => {
    const { status, stdout, stderr } = runCli(["tizen-config"], "/nao/existe.json");
    expect(status).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/config\/hosted\.json/);
  });

  it("builds the local test page without the hosted file", () => {
    const { status, stdout } = runCli(["tizen-config", "--test"], "/nao/existe.json");
    expect(status).toBe(0);
    expect(stdout).toContain('<content src="index.html"/>');
    expect(stdout).not.toMatch(/__[A-Z_]+__|origin="\*"/);
  });

  it("rejects an unknown command", () => {
    const { status, stderr } = runCli(["nope"], writeConfig(sample));
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/Uso:/);
  });
});

describe("loadHostedConfig", () => {
  it("reads the domain", () => {
    expect(loadHostedConfig(writeConfig(sample))).toEqual(sample);
  });

  it("fails with a clear message when the local file is missing", () => {
    expect(() => loadHostedConfig("/nao/existe/hosted.json")).toThrow(/config\/hosted\.json/);
  });

  it.each([
    ["domain with scheme", { ...sample, domain: "https://meu-app.pages.dev" }, /domain/],
    ["domain with path", { ...sample, domain: "meu-app.pages.dev/x" }, /domain/],
    ["missing domain", {}, /domain/],
    ["invalid JSON", "{nope", /JSON/],
  ])("rejects %s", (_name, content, message) => {
    expect(() => loadHostedConfig(writeConfig(content))).toThrow(message);
  });

  it("accepts the versioned config/hosted.json", () => {
    expect(() => loadHostedConfig(CONFIG_PATH)).not.toThrow();
  });
});

describe("generated Tizen config.xml", () => {
  const xml = renderTizenConfig(template, tizenOptionsFor(sample));

  it("points content src at the hosted URL", () => {
    expect(xml).toContain('<content src="https://meu-app.pages.dev/"/>');
  });

  it("restricts access to the hosted domain and YouTube, never *", () => {
    const origins = [...xml.matchAll(/<access origin="([^"]+)"/g)].map((m) => m[1]);
    expect(origins).toContain("https://meu-app.pages.dev");
    expect(origins).toContain("https://www.youtube.com");
    expect(origins).not.toContain("*");
    expect(origins.every((o) => o?.startsWith("https://"))).toBe(true);
  });

  it("allows every YouTube origin the web app's CSP allows", () => {
    const html = readFileSync(join(repoRoot, "web", "index.html"), "utf8");
    const cspOrigins = new Set(html.match(/https:\/\/[a-z0-9.-]*(youtube|ytimg)[a-z0-9.-]*/g));
    const origins = [...xml.matchAll(/<access origin="([^"]+)"/g)].map((m) => m[1]);
    expect(cspOrigins.size).toBeGreaterThan(0);
    for (const origin of cspOrigins) expect(origins).toContain(origin);
  });

  it("leaves no placeholder behind", () => {
    expect(xml).not.toMatch(/__[A-Z_]+__/);
  });
});

describe("the config is versioned", () => {
  it("config/hosted.json is tracked by git", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot }).toString().split("\0");
    expect(tracked).toContain("config/hosted.json");
  });
});
