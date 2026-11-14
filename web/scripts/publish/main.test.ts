import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Deployer, Release } from "./deployer.ts";
import { runCommand } from "./main.ts";
import { PublishError } from "./guards.ts";
import { fakeCatalog, writeTree } from "./test-helpers.ts";

const example = readFileSync(new URL("../../fixtures/catalog.example.json", import.meta.url), "utf8");

function fakeDeployer(releases: Release[] = []) {
  const calls: string[][] = [];
  const deployer: Deployer = {
    deploy: async (dir) => {
      calls.push(["deploy", dir]);
      return { tag: "site-20261114-153000" };
    },
    list: async () => {
      calls.push(["list"]);
      return releases;
    },
    promote: async (tag) => void calls.push(["promote", tag]),
  };
  return { deployer, calls };
}

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

  const remote = "git@github.com:pradokez/mtv-tv-app.git";

  function run(argv: string[], deployer: Deployer, remoteUrl = remote) {
    const log = (line: string) => void output.push(line);
    return runCommand(argv, { remote: remoteUrl, deployer, build, webRoot, log, error: log });
  }

  it("builds and deploys the tizen build once, then prints the Pages URL and the tag", async () => {
    const { deployer, calls } = fakeDeployer();

    expect(await run(["publish"], deployer)).toBe(0);

    expect(built).toBe(1);
    expect(calls).toEqual([["deploy", join(webRoot, "dist-tizen")]]);
    expect(output.join("\n")).toMatch(/site-20261114-153000/);
    expect(output).toContain("https://pradokez.github.io/mtv-tv-app/");
  });

  it("fails before building without the real catalog", async () => {
    rmSync(join(webRoot, "public/catalog.json"));
    const { deployer, calls } = fakeDeployer();

    expect(await run(["publish"], deployer)).toBe(1);

    expect(output.join("\n")).toMatch(/catálogo real não encontrado/);
    expect(built).toBe(0);
    expect(calls).toEqual([]);
  });

  it("fails before building with the example catalog", async () => {
    writeTree(webRoot, { "public/catalog.json": example });
    const { deployer, calls } = fakeDeployer();

    expect(await run(["publish"], deployer)).toBe(1);

    expect(output.join("\n")).toMatch(/catálogo de exemplo/);
    expect(calls).toEqual([]);
  });

  it("fails before building when the remote is not on GitHub", async () => {
    const { deployer, calls } = fakeDeployer();

    expect(await run(["publish"], deployer, "git@gitlab.com:o/r.git")).toBe(1);

    expect(output.join("\n")).toMatch(/não é do GitHub/);
    expect(built).toBe(0);
    expect(calls).toEqual([]);
  });

  it("does not deploy when the build shipped the example catalog", async () => {
    const { deployer, calls } = fakeDeployer();
    const brokenBuild = async () => {
      await build();
      writeTree(join(webRoot, "dist-tizen"), { "catalog.json": example });
    };
    const log = (line: string) => void output.push(line);

    expect(await runCommand(["publish"], { remote, deployer, build: brokenBuild, webRoot, log, error: log })).toBe(1);

    expect(output.join("\n")).toMatch(/dist-tizen\/catalog.json é o catálogo de exemplo/);
    expect(calls).toEqual([]);
  });

  it("lists the publications and marks the live one", async () => {
    const { deployer, calls } = fakeDeployer([
      { tag: "site-20261114-153000", current: false },
      { tag: "site-20261113-090000", current: true },
    ]);

    expect(await run(["list"], deployer)).toBe(0);

    expect(output).toEqual(["site-20261114-153000", "site-20261113-090000  (no ar)"]);
    expect(calls).toEqual([["list"]]);
    expect(built).toBe(0);
  });

  it("says so when there is no publication yet", async () => {
    const { deployer } = fakeDeployer();

    expect(await run(["list"], deployer)).toBe(0);

    expect(output).toEqual(["nenhuma publicação"]);
  });

  it("promotes the tag given on rollback", async () => {
    const { deployer, calls } = fakeDeployer();

    expect(await run(["rollback", "site-20261113-090000"], deployer)).toBe(0);

    expect(calls).toEqual([["promote", "site-20261113-090000"]]);
    expect(output.join("\n")).toMatch(/site-20261113-090000.*https:\/\/pradokez\.github\.io\/mtv-tv-app\//);
    expect(built).toBe(0);
  });

  it("reports a deployer failure and exits 1", async () => {
    const { deployer } = fakeDeployer();
    deployer.promote = async () => {
      throw new PublishError("tag site-1 não encontrada");
    };

    expect(await run(["rollback", "site-1"], deployer)).toBe(1);

    expect(output).toEqual(["Publicação falhou: tag site-1 não encontrada"]);
  });

  it("explains how to use rollback and unknown commands", async () => {
    const { deployer, calls } = fakeDeployer();

    expect(await run(["rollback"], deployer)).toBe(1);
    expect(await run(["outro"], deployer)).toBe(1);

    expect(output.join("\n")).toMatch(/pnpm publish:rollback <tag>/);
    expect(calls).toEqual([]);
  });
});
