/**
 * Publishes the app to Cloudflare Pages under a secret path:
 *
 * - `pnpm publish:site`: checks the real catalog, runs `pnpm build:tizen`,
 *   stages `dist-publish/<token>/` with `noindex`, checks it again and
 *   deploys. Prints `https://<project>.pages.dev/<token>/`.
 * - `pnpm publish:list`: lists the production deployments.
 * - `pnpm publish:rollback <id>`: makes an old deployment the live one.
 *
 * Settings come from `web/.publish.local` (git-ignored, `KEY=value` lines) or
 * the environment, which wins: `PAGES_PROJECT`, `PUBLISH_TOKEN`,
 * `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. The token is never written
 * to a committed file; the catalog never goes through git, CI or a secret.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnRunner, wranglerDeployer, type Deployer } from "./deployer.ts";
import { checkCatalog, checkStaged, checkToken, PublishError } from "./guards.ts";
import { stage } from "./stage.ts";

const KEYS = ["PAGES_PROJECT", "PUBLISH_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] as const;
type Config = Partial<Record<(typeof KEYS)[number], string>>;

/** `fileText` is `web/.publish.local` (`undefined` when absent); `env` wins over it. */
export function loadConfig(fileText: string | undefined, env: Record<string, string | undefined>): Config {
  const fromFile: Record<string, string> = {};
  for (const line of (fileText ?? "").split("\n")) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1] && match[2] !== undefined) fromFile[match[1]] = match[2];
  }
  const config: Config = {};
  for (const key of KEYS) {
    const value = env[key] || fromFile[key];
    if (value) config[key] = value;
  }
  return config;
}

type Deps = {
  config: Config;
  deployer: Deployer;
  /** `pnpm build:tizen`. */
  build: () => Promise<void>;
  webRoot: string;
  log: (line: string) => void;
  error: (line: string) => void;
};

async function publish({ config, deployer, build, webRoot, log }: Deps): Promise<void> {
  const token = checkToken(config.PUBLISH_TOKEN);
  const project = config.PAGES_PROJECT;
  if (!project) {
    throw new PublishError("defina PAGES_PROJECT (em web/.publish.local ou na variável de ambiente) com o projeto do Cloudflare Pages");
  }
  const example = readFileSync(join(webRoot, "fixtures/catalog.example.json"), "utf8");
  const catalog = join(webRoot, "public/catalog.json");
  // Before building: without the real catalog, vite would ship the example.
  checkCatalog(existsSync(catalog) ? readFileSync(catalog, "utf8") : undefined, example);

  await build();
  const out = join(webRoot, "dist-publish");
  stage({ build: join(webRoot, "dist-tizen"), out, token });
  checkStaged(out, token, example);
  await deployer.deploy(out);

  log("");
  log("Publicado em:");
  log(`https://${project}.pages.dev/${token}/`);
  log("");
  log(
    "Atenção: deploys antigos continuam acessíveis pela URL própria de cada um (<id>.<projeto>.pages.dev) " +
      "com o token da época. Ao trocar o token, apague-os (veja o README).",
  );
}

/** Returns the exit code. */
export async function runCommand(argv: string[], deps: Deps): Promise<number> {
  const [command, id] = argv;
  try {
    if (command === "publish") await publish(deps);
    else if (command === "deploys") await deps.deployer.list();
    else if (command === "rollback" && id) await deps.deployer.promote(id);
    else if (command === "rollback") throw new PublishError("uso: pnpm publish:rollback <id> (ids em pnpm publish:list)");
    else throw new PublishError("uso: node scripts/publish/main.ts publish | deploys | rollback <id>");
    return 0;
  } catch (error) {
    if (!(error instanceof PublishError)) throw error;
    deps.error(`Publicação falhou: ${error.message}`);
    return 1;
  }
}

if (import.meta.main) {
  const webRoot = fileURLToPath(new URL("../..", import.meta.url));
  const localFile = join(webRoot, ".publish.local");
  const config = loadConfig(existsSync(localFile) ? readFileSync(localFile, "utf8") : undefined, process.env);
  const env: Record<string, string> = {};
  if (config.CLOUDFLARE_API_TOKEN) env.CLOUDFLARE_API_TOKEN = config.CLOUDFLARE_API_TOKEN;
  if (config.CLOUDFLARE_ACCOUNT_ID) env.CLOUDFLARE_ACCOUNT_ID = config.CLOUDFLARE_ACCOUNT_ID;

  process.exitCode = await runCommand(process.argv.slice(2), {
    config,
    deployer: wranglerDeployer({ project: config.PAGES_PROJECT ?? "", run: spawnRunner, env }),
    build: async () => {
      const result = spawnSync("pnpm", ["build:tizen"], { cwd: webRoot, stdio: "inherit" });
      if (result.status !== 0) throw new PublishError("pnpm build:tizen falhou");
    },
    webRoot,
    log: console.log,
    error: console.error,
  });
}
