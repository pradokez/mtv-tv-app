import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Deployer } from "./deployer.ts";
import { loadConfig, runCommand } from "./main.ts";
import { fakeCatalog, TOKEN, writeTree } from "./test-helpers.ts";

const example = readFileSync(new URL("../../fixtures/catalog.example.json", import.meta.url), "utf8");

function fakeDeployer() {
  const calls: string[][] = [];
  const deployer: Deployer = {
    deploy: async (dir) => void calls.push(["deploy", dir]),
    list: async () => void calls.push(["list"]),
    promote: async (id) => void calls.push(["promote", id]),
  };
  return { deployer, calls };
}

describe("loadConfig", () => {
  it("reads KEY=value lines and lets the environment win", () => {
    const file = "# comentário\nPAGES_PROJECT=mtv-tv\n\nPUBLISH_TOKEN = do-arquivo \n";

    expect(loadConfig(file, { PUBLISH_TOKEN: "do-ambiente", HOME: "/x" })).toEqual({
      PAGES_PROJECT: "mtv-tv",
      PUBLISH_TOKEN: "do-ambiente",
    });
  });

  it("works without the local file", () => {
    expect(loadConfig(undefined, { PAGES_PROJECT: "p" })).toEqual({ PAGES_PROJECT: "p" });
  });
});

describe("runCommand", () => {
  let webRoot: string;
  let output: string[];
  let built: number;
  beforeEach(() => {
    webRoot = mkdtempSync(join(tmpdir(), "publish-main-"));
    writeTree(webRoot, { "fixtures/catalog.example.json": example, "public/catalog.json": fakeCatalog(20, 100) });
    output = [];
    built = 0;
  });
  afterEach(() => rmSync(webRoot, { recursive: true, force: true }));

  /** Stands in for `pnpm build:tizen`: copies `public/` like vite does. */
  async function build(): Promise<void> {
    built++;
    writeTree(join(webRoot, "dist-tizen"), {
      "index.html": "<html><head>\n    <title>MTV TV</title>\n<script defer src=\"./assets/i.js\"></script></head></html>",
      "assets/i.js": "1",
      "catalog.json": readFileSync(join(webRoot, "public/catalog.json"), "utf8"),
    });
  }

  function run(argv: string[], config: Record<string, string>, deployer: Deployer) {
    const log = (line: string) => void output.push(line);
    return runCommand(argv, { config, deployer, build, webRoot, log, error: log });
  }

  const config = { PAGES_PROJECT: "mtv-tv", PUBLISH_TOKEN: TOKEN };

  it("builds, stages and deploys once, then prints the URL under the secret path", async () => {
    const { deployer, calls } = fakeDeployer();

    expect(await run(["publish"], config, deployer)).toBe(0);

    expect(built).toBe(1);
    expect(calls).toEqual([["deploy", join(webRoot, "dist-publish")]]);
    expect(output).toContain(`https://mtv-tv.pages.dev/${TOKEN}/`);
    expect(output.join("\n")).toMatch(/deploys antigos/);
  });

  it("publishes under a new path when the token changes", async () => {
    const { deployer } = fakeDeployer();
    const other = "N".repeat(40);

    await run(["publish"], { ...config, PUBLISH_TOKEN: other }, deployer);

    expect(output).toContain(`https://mtv-tv.pages.dev/${other}/`);
    expect(output.join("\n")).not.toContain(TOKEN);
  });

  it("fails before building without the real catalog", async () => {
    rmSync(join(webRoot, "public/catalog.json"));
    const { deployer, calls } = fakeDeployer();

    expect(await run(["publish"], config, deployer)).toBe(1);

    expect(output.join("\n")).toMatch(/catálogo real não encontrado/);
    expect(built).toBe(0);
    expect(calls).toEqual([]);
  });

  it("fails before building with the example catalog", async () => {
    writeTree(webRoot, { "public/catalog.json": example });
    const { deployer, calls } = fakeDeployer();

    expect(await run(["publish"], config, deployer)).toBe(1);

    expect(output.join("\n")).toMatch(/catálogo de exemplo/);
    expect(calls).toEqual([]);
  });

  it("fails without the secret path or the project", async () => {
    const { deployer, calls } = fakeDeployer();

    expect(await run(["publish"], { PAGES_PROJECT: "mtv-tv" }, deployer)).toBe(1);
    expect(await run(["publish"], { PUBLISH_TOKEN: TOKEN }, deployer)).toBe(1);

    expect(output.join("\n")).toMatch(/PUBLISH_TOKEN[\s\S]*PAGES_PROJECT/);
    expect(calls).toEqual([]);
  });

  it("does not deploy when the staged site fails a guard", async () => {
    const { deployer, calls } = fakeDeployer();
    const brokenBuild = async () => {
      await build();
      writeTree(join(webRoot, "dist-tizen"), { "robots.txt": "User-agent: *" });
    };
    const log = (line: string) => void output.push(line);

    expect(await runCommand(["publish"], { config, deployer, build: brokenBuild, webRoot, log, error: log })).toBe(1);

    expect(output.join("\n")).toMatch(/robots.txt/);
    expect(calls).toEqual([]);
  });

  it("lists deployments and promotes the one given", async () => {
    const { deployer, calls } = fakeDeployer();

    expect(await run(["deploys"], config, deployer)).toBe(0);
    expect(await run(["rollback", "0a1b-2c3d"], config, deployer)).toBe(0);

    expect(calls).toEqual([["list"], ["promote", "0a1b-2c3d"]]);
    expect(built).toBe(0);
  });

  it("explains how to use rollback and unknown commands", async () => {
    const { deployer, calls } = fakeDeployer();

    expect(await run(["rollback"], config, deployer)).toBe(1);
    expect(await run(["outro"], config, deployer)).toBe(1);

    expect(output.join("\n")).toMatch(/pnpm publish:rollback <id>/);
    expect(calls).toEqual([]);
  });
});
