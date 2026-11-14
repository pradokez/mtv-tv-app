/**
 * Talks to Cloudflare Pages. Kept behind `Deployer` so the publish flow is
 * tested without network or account.
 *
 * Deploy and list go through wrangler (pinned devDependency). Wrangler has no
 * command to promote an old Pages deployment, so rollback calls the Cloudflare
 * API directly (`POST .../deployments/<id>/rollback`).
 */
import { spawn } from "node:child_process";
import { PublishError } from "./guards.ts";

export interface Deployer {
  /** Uploads `dir` as the new production deployment. */
  deploy(dir: string): Promise<void>;
  /** Prints the production deployments, newest first, with their ids. */
  list(): Promise<void>;
  /** Makes deployment `id` the live one again. */
  promote(id: string): Promise<void>;
}

/** Runs a command with the terminal attached; rejects when it exits non-zero. */
export type Runner = (command: string, args: string[], env: Record<string, string>) => Promise<void>;

/** The branch the Pages project was created with as `--production-branch`. */
export const PRODUCTION_BRANCH = "main";

const API = "https://api.cloudflare.com/client/v4";

export function wranglerDeployer({
  project,
  run,
  env,
  fetch = globalThis.fetch,
}: {
  project: string;
  run: Runner;
  /** `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, passed on to wrangler and used for rollback. */
  env: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}): Deployer {
  const wrangler = (...args: string[]) => run("pnpm", ["exec", "wrangler", "pages", ...args], env);
  return {
    deploy: (dir) =>
      wrangler("deploy", dir, "--project-name", project, "--branch", PRODUCTION_BRANCH, "--commit-dirty=true"),
    list: () => wrangler("deployment", "list", "--project-name", project, "--environment", "production"),
    promote: async (id) => {
      const { CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId } = env;
      if (!apiToken || !accountId) {
        throw new PublishError("o rollback usa a API do Cloudflare: defina CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID");
      }
      if (!/^[A-Za-z0-9-]+$/.test(id)) throw new PublishError(`id de deploy inválido: ${id}`);
      const response = await fetch(
        `${API}/accounts/${accountId}/pages/projects/${project}/deployments/${id}/rollback`,
        { method: "POST", headers: { Authorization: `Bearer ${apiToken}` } },
      );
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; errors?: { message: string }[] };
      if (!response.ok || !body.success) {
        const reason = body.errors?.map((e) => e.message).join("; ") || "sem detalhes";
        throw new PublishError(`rollback recusado (HTTP ${response.status}): ${reason}`);
      }
    },
  };
}

export const spawnRunner: Runner = (command, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new PublishError(`${command} ${args.slice(0, 4).join(" ")} saiu com código ${code}`)),
    );
  });
