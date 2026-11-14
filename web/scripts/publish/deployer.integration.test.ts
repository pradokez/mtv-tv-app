import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitDeployer, spawnRunner, type Runner } from "./deployer.ts";
import { writeTree } from "./test-helpers.ts";

// Real git against a local bare repository standing in for GitHub.
describe("gitDeployer with a real git remote", () => {
  let root: string;
  let origin: string;
  let dist: string;
  let identity: Record<string, string>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "publish-git-"));
    origin = join(root, "origin.git");
    dist = join(root, "dist");
    execFileSync("git", ["init", "-q", "--bare", origin]);
    writeTree(dist, { "index.html": "<html></html>", "catalog.json": "{}" });
    // Nothing from the machine's git config: no identity, no hooks, no signing.
    identity = {
      HOME: root,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Teste",
      GIT_AUTHOR_EMAIL: "teste@example.com",
      GIT_COMMITTER_NAME: "Teste",
      GIT_COMMITTER_EMAIL: "teste@example.com",
    };
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run: Runner = (command, args, opts) => spawnRunner(command, args, { ...opts, env: { ...opts?.env, ...identity } });
  const originGit = (...args: string[]) => execFileSync("git", ["-C", origin, ...args], { encoding: "utf8" }).trim();

  /** A clock that moves one minute per publication. */
  function clock() {
    let minute = 0;
    return () => new Date(Date.UTC(2026, 10, 14, 12, minute++, 0));
  }

  it("publishes one parentless commit with the site and a tag per publication", async () => {
    const deployer = gitDeployer({ run, remote: origin, now: clock(), warn: () => {} });

    const first = await deployer.deploy(dist);
    writeTree(dist, { "index.html": "<html>v2</html>" });
    const second = await deployer.deploy(dist);

    expect(originGit("rev-list", "--count", "gh-pages")).toBe("1");
    expect(originGit("rev-list", "--parents", "-n", "1", "gh-pages").split(" ")).toHaveLength(1);
    expect(originGit("ls-tree", "--name-only", "gh-pages").split("\n").sort()).toEqual([
      ".nojekyll", "catalog.json", "index.html",
    ]);
    expect(originGit("show", "gh-pages:index.html")).toBe("<html>v2</html>");
    expect(originGit("tag", "--list").split("\n")).toEqual([first.tag, second.tag]);
    expect(await deployer.list()).toEqual([
      { tag: second.tag, current: true },
      { tag: first.tag, current: false },
    ]);
    expect(readdirSync(dist).sort()).toEqual(["catalog.json", "index.html"]);
  });

  it("rolls gh-pages back to the commit of an older tag", async () => {
    const deployer = gitDeployer({ run, remote: origin, now: clock(), warn: () => {} });
    const first = await deployer.deploy(dist);
    const firstSha = originGit("rev-parse", "gh-pages");
    writeTree(dist, { "index.html": "<html>v2</html>" });
    await deployer.deploy(dist);

    await deployer.promote(first.tag);

    expect(originGit("rev-parse", "gh-pages")).toBe(firstSha);
    expect((await deployer.list()).filter((r) => r.current).map((r) => r.tag)).toEqual([first.tag]);
  });

  it("fails clearly when the tag does not exist", async () => {
    const deployer = gitDeployer({ run, remote: origin, warn: () => {} });
    await deployer.deploy(dist);

    await expect(deployer.promote("site-19990101-000000")).rejects.toThrow(/não encontrada/);
  });

  it("keeps only the 5 newest tags after 7 publications", async () => {
    const deployer = gitDeployer({ run, remote: origin, now: clock(), warn: () => {} });
    const tags: string[] = [];

    for (let i = 0; i < 7; i++) tags.push((await deployer.deploy(dist)).tag);

    expect(originGit("tag", "--list").split("\n")).toEqual(tags.slice(2));
  }, 30_000);
});
