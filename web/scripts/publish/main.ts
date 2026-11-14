/**
 * Publishes the app to GitHub Pages, at `https://<owner>.github.io/<repo>/`
 * (the site is public):
 *
 * - `pnpm publish:site`: checks the real catalog, runs `pnpm build:tizen`,
 *   checks `dist-tizen/` again and publishes it as an orphan commit on the
 *   `gh-pages` branch, tagged `site-YYYYMMDD-HHMMSS`. Prints the URL and tag.
 * - `pnpm publish:list`: lists the available publications (tags).
 * - `pnpm publish:rollback <tag>`: makes an old publication the live one.
 *
 * Runs on your machine with the git credentials already configured for
 * `origin`; no token is stored. The real catalog only ever reaches the
 * `gh-pages` branch and its tags, never `main`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitDeployer, pagesUrl, spawnRunner, type Deployer } from "./deployer.ts";
import { checkBuild, checkCatalog, PublishError, readIfExists } from "./guards.ts";

type Deps = {
  /** The git remote the site is published to (`origin`). */
  remote: string;
  deployer: Deployer;
  /** `pnpm build:tizen`. */
  build: () => Promise<void>;
  webRoot: string;
  log: (line: string) => void;
  error: (line: string) => void;
};

async function publish({ remote, deployer, build, webRoot, log }: Deps): Promise<void> {
  // Before anything else: a remote that is not on GitHub has no Pages URL.
  const url = pagesUrl(remote);
  const example = readFileSync(join(webRoot, "fixtures/catalog.example.json"), "utf8");
  const catalog = join(webRoot, "public/catalog.json");
  // Before building: without the real catalog, vite would ship the example.
  checkCatalog(readIfExists(catalog), example);

  await build();
  const out = join(webRoot, "dist-tizen");
  checkBuild(out, example);
  const { tag } = await deployer.deploy(out);

  log("");
  log(`Publicado (${tag}) em:`);
  log(url);
}

async function list({ deployer, log }: Deps): Promise<void> {
  const releases = await deployer.list();
  if (releases.length === 0) log("nenhuma publicação");
  for (const { tag, current } of releases) log(current ? `${tag}  (no ar)` : tag);
}

/** Returns the exit code. */
export async function runCommand(argv: string[], deps: Deps): Promise<number> {
  const [command, tag] = argv;
  try {
    if (command === "publish") await publish(deps);
    else if (command === "list") await list(deps);
    else if (command === "rollback" && tag) {
      await deps.deployer.promote(tag);
      deps.log(`Publicação ${tag} no ar de novo: ${pagesUrl(deps.remote)}`);
    } else if (command === "rollback") {
      throw new PublishError("uso: pnpm publish:rollback <tag> (tags em pnpm publish:list)");
    } else throw new PublishError("uso: node scripts/publish/main.ts publish | list | rollback <tag>");
    return 0;
  } catch (error) {
    if (!(error instanceof PublishError)) throw error;
    deps.error(`Publicação falhou: ${error.message}`);
    return 1;
  }
}

if (import.meta.main) {
  const webRoot = fileURLToPath(new URL("../..", import.meta.url));
  const origin = spawnSync("git", ["remote", "get-url", "origin"], { cwd: webRoot, encoding: "utf8" });
  const remote = origin.status === 0 ? origin.stdout.trim() : "";
  if (!remote) {
    console.error("Publicação falhou: o repositório não tem o remoto origin (git remote add origin <url do GitHub>)");
    process.exitCode = 1;
  } else {
    process.exitCode = await runCommand(process.argv.slice(2), {
      remote,
      deployer: gitDeployer({ run: spawnRunner, remote, warn: console.warn }),
      build: async () => {
        const result = spawnSync("pnpm", ["build:tizen"], { cwd: webRoot, stdio: "inherit" });
        if (result.status !== 0) throw new PublishError("pnpm build:tizen falhou");
      },
      webRoot,
      log: console.log,
      error: console.error,
    });
  }
}
