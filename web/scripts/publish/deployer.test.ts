import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PublishError } from "./guards.ts";
import { gitDeployer, KEEP_TAGS, pagesUrl, releaseTag, TAG_PATTERN, type Runner } from "./deployer.ts";
import { writeTree } from "./test-helpers.ts";

const REMOTE = "git@github.com:pradokez/mtv-tv-app.git";

type Call = { command: string; args: string[]; cwd?: string };

/**
 * A runner that records every call and answers `ls-remote` from `remote`
 * (`refs/...` → sha). `fail` makes a call throw, like a non-zero exit would.
 */
function fakeGit(remote: Record<string, string> = {}, fail?: (args: string[]) => boolean) {
  const calls: Call[] = [];
  /** Snapshot of the working tree at the moment of `git commit`. */
  const committed: string[][] = [];
  const run: Runner = async (command, args, opts) => {
    calls.push({ command, args, cwd: opts?.cwd });
    if (fail?.(args)) throw new PublishError(`${command} ${args[0]} saiu com código 1`);
    if (args[0] === "ls-remote") {
      return Object.entries(remote)
        .map(([ref, sha]) => `${sha}\t${ref}\n`)
        .join("");
    }
    if (args[0] === "commit" && opts?.cwd) committed.push(readdirSync(opts.cwd).filter((f) => f !== ".git").sort());
    if (args[0] === "rev-parse") return "c0ffee\n";
    return "";
  };
  const git = (name: string) => calls.filter((c) => c.args[0] === name);
  return { run, calls, git, committed };
}

const tagRefs = (...names: string[]) => Object.fromEntries(names.map((n, i) => [`refs/tags/${n}`, `sha${i}`]));
const sevenTags = Array.from({ length: 7 }, (_, i) => `site-2026111${i}-120000`);

describe("pagesUrl", () => {
  it.each([
    "https://github.com/pradokez/mtv-tv-app.git",
    "https://github.com/pradokez/mtv-tv-app",
    "git@github.com:pradokez/mtv-tv-app.git",
    "ssh://git@github.com/pradokez/mtv-tv-app.git",
  ])("derives the Pages URL from %s", (remote) => {
    expect(pagesUrl(remote)).toBe("https://pradokez.github.io/mtv-tv-app/");
  });

  it("lowercases the owner, which becomes the host", () => {
    expect(pagesUrl("https://github.com/PradoKez/mtv-tv-app")).toBe("https://pradokez.github.io/mtv-tv-app/");
  });

  it("refuses a remote that is not on GitHub", () => {
    expect(() => pagesUrl("git@gitlab.com:o/r.git")).toThrow(PublishError);
    expect(() => pagesUrl("/tmp/some/bare.git")).toThrow(/GitHub/);
  });
});

describe("releaseTag", () => {
  it("is the UTC date and time with leading zeros", () => {
    expect(releaseTag(new Date("2026-01-02T03:04:05Z"))).toBe("site-20260102-030405");
    expect(releaseTag(new Date("2026-11-14T15:30:00Z"))).toMatch(TAG_PATTERN);
  });
});

describe("gitDeployer", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "publish-deployer-"));
    writeTree(dir, { "index.html": "<html></html>", "assets/i.js": "1" });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const now = () => new Date("2026-11-14T15:30:00Z");

  describe("deploy", () => {
    it("force-pushes an orphan gh-pages commit and the tag, and returns the tag", async () => {
      const { run, git, committed } = fakeGit();

      const { tag } = await gitDeployer({ run, remote: REMOTE, now, warn: () => {} }).deploy(dir);

      expect(tag).toBe("site-20261114-153000");
      expect(committed).toEqual([[".nojekyll", "assets", "index.html"]]);
      expect(git("push")[0]?.args).toEqual([
        "push", "--atomic", "--force", REMOTE, "HEAD:refs/heads/gh-pages", "refs/tags/site-20261114-153000",
      ]);
      expect(git("tag")[0]?.args).toEqual(["tag", "site-20261114-153000"]);
    });

    it("works in a temp folder and leaves the built folder alone", async () => {
      const { run, calls } = fakeGit();

      await gitDeployer({ run, remote: REMOTE, now, warn: () => {} }).deploy(dir);

      expect(readdirSync(dir).sort()).toEqual(["assets", "index.html"]);
      const cwds = new Set(calls.map((c) => c.cwd).filter(Boolean));
      expect(cwds.has(dir)).toBe(false);
      for (const cwd of cwds) expect(existsSync(cwd as string)).toBe(false);
    });

    it("removes the temp folder even when the push fails", async () => {
      const { run, calls } = fakeGit({}, (args) => args[0] === "push");

      await expect(gitDeployer({ run, remote: REMOTE, now, warn: () => {} }).deploy(dir)).rejects.toThrow(/push/);

      const cwd = calls.find((c) => c.args[0] === "push")?.cwd as string;
      expect(existsSync(cwd)).toBe(false);
    });

    it("explains a commit that failed, pointing at the git identity", async () => {
      const { run } = fakeGit({}, (args) => args[0] === "commit");

      await expect(gitDeployer({ run, remote: REMOTE, now, warn: () => {} }).deploy(dir)).rejects.toThrow(
        /git config --global user\.name/,
      );
    });

    it("keeps the 5 newest tags and deletes the older ones, never the new one", async () => {
      const { run, git } = fakeGit(tagRefs(...sevenTags, "site-20261114-153000"));

      await gitDeployer({ run, remote: REMOTE, now, warn: () => {} }).deploy(dir);

      // 8 tags on the remote (7 old + the new one): the 3 oldest go, newest first.
      const prune = git("push").find((c) => c.args.some((a) => a.startsWith(":refs/tags/")));
      expect(prune?.args).toEqual([
        "push", REMOTE, `:refs/tags/${sevenTags[2]}`, `:refs/tags/${sevenTags[1]}`, `:refs/tags/${sevenTags[0]}`,
      ]);
    });

    it("never deletes the tag the new release was published under, even if it sorts old", async () => {
      // A clock set back: the new tag is the oldest by name.
      const old = () => new Date("2020-01-01T00:00:00Z");
      const { run, git } = fakeGit(tagRefs(...sevenTags.slice(0, 6), "site-20200101-000000"));

      await gitDeployer({ run, remote: REMOTE, now: old, warn: () => {} }).deploy(dir);

      const deleted = git("push").flatMap((c) => c.args).filter((a) => a.startsWith(":refs/tags/"));
      expect(deleted).toEqual([`:refs/tags/${sevenTags[0]}`]);
    });

    it("does not delete anything with up to 5 tags", async () => {
      const { run, git } = fakeGit(tagRefs(...sevenTags.slice(0, 4), "site-20261114-153000"));

      await gitDeployer({ run, remote: REMOTE, now, warn: () => {} }).deploy(dir);

      expect(KEEP_TAGS).toBe(5);
      expect(git("push")).toHaveLength(1);
    });

    it("only warns when pruning fails: the site is already live", async () => {
      const warnings: string[] = [];
      const { run } = fakeGit(
        tagRefs(...sevenTags, "site-20261114-153000"),
        (args) => args[0] === "push" && args.some((a) => a.startsWith(":refs/tags/")),
      );

      const result = await gitDeployer({ run, remote: REMOTE, now, warn: (m) => warnings.push(m) }).deploy(dir);

      expect(result.tag).toBe("site-20261114-153000");
      expect(warnings.join("\n")).toMatch(/tags antigas/);
    });
  });

  describe("list", () => {
    it("lists the tags newest first and marks the one gh-pages points at", async () => {
      const { run, git } = fakeGit({
        "refs/tags/site-20261112-100000": "aaa",
        "refs/tags/site-20261114-153000": "bbb",
        "refs/tags/site-20261113-090000": "ccc",
        "refs/heads/gh-pages": "ccc",
      });

      const releases = await gitDeployer({ run, remote: REMOTE, warn: () => {} }).list();

      expect(releases).toEqual([
        { tag: "site-20261114-153000", current: false },
        { tag: "site-20261113-090000", current: true },
        { tag: "site-20261112-100000", current: false },
      ]);
      expect(git("ls-remote")[0]?.args).toEqual(["ls-remote", REMOTE, "refs/tags/site-*", "refs/heads/gh-pages"]);
    });

    it("ignores peeled refs and tags that are not releases", async () => {
      const { run } = fakeGit({
        "refs/tags/site-20261114-153000": "aaa",
        "refs/tags/site-20261114-153000^{}": "bbb",
        "refs/tags/site-velha": "ccc",
        "refs/tags/v1": "ddd",
      });

      expect(await gitDeployer({ run, remote: REMOTE, warn: () => {} }).list()).toEqual([
        { tag: "site-20261114-153000", current: false },
      ]);
    });

    it("is empty before the first publication", async () => {
      const { run } = fakeGit();

      expect(await gitDeployer({ run, remote: REMOTE, warn: () => {} }).list()).toEqual([]);
    });
  });

  describe("promote", () => {
    it.each(["../x", "--upload-pack=x", "main", "site-1-2", "site-20261114-153000 "])(
      "rejects %j without calling git",
      async (tag) => {
        const { run, calls } = fakeGit();

        await expect(gitDeployer({ run, remote: REMOTE, warn: () => {} }).promote(tag)).rejects.toThrow(/tag inválida/);
        expect(calls).toEqual([]);
      },
    );

    it("fetches the tag and force-pushes its commit to gh-pages", async () => {
      const { run, git } = fakeGit();

      await gitDeployer({ run, remote: REMOTE, warn: () => {} }).promote("site-20261114-153000");

      expect(git("fetch")[0]?.args).toEqual([
        "fetch", "--depth", "1", REMOTE, "refs/tags/site-20261114-153000:refs/tags/site-20261114-153000",
      ]);
      expect(git("push")[0]?.args).toEqual(["push", "--force", REMOTE, "c0ffee:refs/heads/gh-pages"]);
    });

    it("explains a tag that does not exist", async () => {
      const { run, git } = fakeGit({}, (args) => args[0] === "fetch");

      await expect(
        gitDeployer({ run, remote: REMOTE, warn: () => {} }).promote("site-20261114-153000"),
      ).rejects.toThrow(/tag site-20261114-153000 não encontrada.*pnpm publish:list/);
      expect(git("push")).toEqual([]);
    });
  });
});
