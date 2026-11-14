/**
 * Publishes the built site to GitHub Pages. Kept behind `Deployer` so the
 * publish flow is tested without network or account.
 *
 * Each publication is one orphan commit (no history) force-pushed to the
 * `gh-pages` branch from a temp folder, so the local repo is never touched,
 * plus a lightweight tag `site-YYYYMMDD-HHMMSS` that makes it recoverable.
 * Rollback force-pushes an old tag's commit to `gh-pages` again. Auth is
 * whatever git already has for the remote: no token is handled here.
 */
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublishError } from "./guards.ts";

export type Release = { tag: string; current: boolean };

export interface Deployer {
  /** Publishes `dir` as the new site and returns the tag it was saved under. */
  deploy(dir: string): Promise<{ tag: string }>;
  /** The releases still available, newest first. */
  list(): Promise<Release[]>;
  /** Makes release `tag` the live site again. */
  promote(tag: string): Promise<void>;
}

/** Runs a command and resolves with its stdout; rejects when it exits non-zero. */
export type Runner = (
  command: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
) => Promise<string>;

/** How many releases (tags) stay on the remote, besides the live one. */
export const KEEP_TAGS = 5;
/** The only tag names we create, list or accept: they end up in git arguments. */
export const TAG_PATTERN = /^site-\d{8}-\d{6}$/;

const BRANCH = "gh-pages";

export function releaseTag(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const day = `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `site-${day}-${time}`;
}

/** `https://<owner>.github.io/<repo>/` for a GitHub remote (https, scp-like or ssh). */
export function pagesUrl(remote: string): string {
  const match =
    /^(?:(?:https|ssh):\/\/(?:[^@/]+@)?|(?:[^@/:]+@)?)github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(remote.trim());
  if (!match) throw new PublishError(`o remoto "${remote}" não é do GitHub: não sei a URL do GitHub Pages`);
  return `https://${match[1]!.toLowerCase()}.github.io/${match[2]}/`;
}

export function gitDeployer({
  run,
  remote,
  now = () => new Date(),
  warn,
}: {
  run: Runner;
  /** The git remote URL to publish to. */
  remote: string;
  now?: () => Date;
  warn: (line: string) => void;
}): Deployer {
  const git = (cwd: string | undefined, ...args: string[]) => run("git", args, { cwd });

  async function inTempRepo<T>(work: (cwd: string) => Promise<T>): Promise<T> {
    const cwd = mkdtempSync(join(tmpdir(), "mtv-publish-"));
    try {
      return await work(cwd);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }

  /** Release tags on the remote, newest first, with the commit each points at. */
  async function remoteState(cwd?: string): Promise<{ releases: { tag: string; sha: string }[]; live: string | undefined }> {
    const out = await git(cwd, "ls-remote", remote, "refs/tags/site-*", `refs/heads/${BRANCH}`);
    const releases: { tag: string; sha: string }[] = [];
    let live: string | undefined;
    for (const line of out.split("\n")) {
      const [sha, ref] = line.split("\t");
      if (!sha || !ref) continue;
      if (ref === `refs/heads/${BRANCH}`) live = sha;
      else if (ref.startsWith("refs/tags/") && TAG_PATTERN.test(ref.slice("refs/tags/".length))) {
        releases.push({ tag: ref.slice("refs/tags/".length), sha });
      }
    }
    releases.sort((a, b) => (a.tag < b.tag ? 1 : a.tag > b.tag ? -1 : 0));
    return { releases, live };
  }

  async function prune(cwd: string, keep: string): Promise<void> {
    try {
      const { releases } = await remoteState(cwd);
      const recent = new Set(releases.slice(0, KEEP_TAGS).map((r) => r.tag));
      const old = releases.filter((r) => r.tag !== keep && !recent.has(r.tag));
      if (old.length === 0) return;
      await git(cwd, "push", remote, ...old.map((r) => `:refs/tags/${r.tag}`));
    } catch (error) {
      warn(`o site está no ar, mas não consegui apagar as tags antigas: ${(error as Error).message}`);
    }
  }

  return {
    deploy: (dir) =>
      inTempRepo(async (cwd) => {
        const tag = releaseTag(now());
        cpSync(dir, cwd, { recursive: true });
        // Without it GitHub would run the files through Jekyll and drop some of them.
        writeFileSync(join(cwd, ".nojekyll"), "");
        await git(cwd, "init", "-q", "-b", BRANCH);
        await git(cwd, "add", "-A");
        try {
          await git(cwd, "commit", "-q", "-m", `Publicação ${tag}`);
        } catch (error) {
          throw new PublishError(
            `não consegui criar o commit (${(error as Error).message}). Se for a identidade do git: ` +
              'git config --global user.name "Seu Nome" && git config --global user.email voce@exemplo.com',
          );
        }
        await git(cwd, "tag", tag);
        // Atomic: the live branch never moves without its tag, so it can always be rolled back to.
        await git(cwd, "push", "--atomic", "--force", remote, `HEAD:refs/heads/${BRANCH}`, `refs/tags/${tag}`);
        await prune(cwd, tag);
        return { tag };
      }),

    list: async () => {
      const { releases, live } = await remoteState();
      return releases.map((r) => ({ tag: r.tag, current: r.sha === live }));
    },

    promote: async (tag) => {
      // The tag goes into git arguments: only names we create are accepted.
      if (!TAG_PATTERN.test(tag)) throw new PublishError(`tag inválida: ${tag} (formato site-AAAAMMDD-HHMMSS)`);
      await inTempRepo(async (cwd) => {
        // Looked up first, so a network or auth failure is not reported as a missing tag.
        const release = (await remoteState(cwd)).releases.find((r) => r.tag === tag);
        if (!release) throw new PublishError(`tag ${tag} não encontrada: veja pnpm publish:list`);
        await git(cwd, "init", "-q");
        // The push needs the commit locally; one level of history is enough.
        await git(cwd, "fetch", "--depth", "1", remote, `refs/tags/${tag}:refs/tags/${tag}`);
        await git(cwd, "push", "--force", remote, `${release.sha}:refs/heads/${BRANCH}`);
      });
    },
  };
}

export const spawnRunner: Runner = (command, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      stdio: ["inherit", "pipe", "inherit"],
      env: { ...process.env, ...opts.env },
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => void (stdout += chunk));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(stdout) : reject(new PublishError(`${command} ${args.slice(0, 3).join(" ")} saiu com código ${code}`)),
    );
  });
