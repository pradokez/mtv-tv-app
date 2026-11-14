import { describe, expect, it } from "vitest";
import { wranglerDeployer, type Runner } from "./deployer.ts";

type Call = { command: string; args: string[]; env: Record<string, string> };

function recorder(): { run: Runner; calls: Call[] } {
  const calls: Call[] = [];
  return { calls, run: async (command, args, env) => void calls.push({ command, args, env }) };
}

const credentials = { CLOUDFLARE_API_TOKEN: "api-token", CLOUDFLARE_ACCOUNT_ID: "account-id" };

describe("wranglerDeployer", () => {
  it("deploys the folder to the production branch of the project", async () => {
    const { run, calls } = recorder();

    await wranglerDeployer({ project: "mtv-tv", run, env: credentials }).deploy("dist-publish");

    expect(calls).toEqual([
      {
        command: "pnpm",
        args: ["exec", "wrangler", "pages", "deploy", "dist-publish", "--project-name", "mtv-tv", "--branch", "main", "--commit-dirty=true"],
        env: credentials,
      },
    ]);
  });

  it("lists the production deployments", async () => {
    const { run, calls } = recorder();

    await wranglerDeployer({ project: "mtv-tv", run, env: {} }).list();

    expect(calls.map((c) => c.args)).toEqual([
      ["exec", "wrangler", "pages", "deployment", "list", "--project-name", "mtv-tv", "--environment", "production"],
    ]);
  });

  it("promotes an old deployment through the Cloudflare API", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Response.json({ success: true, errors: [] });
    };

    await wranglerDeployer({ project: "mtv-tv", run: recorder().run, env: credentials, fetch }).promote("0a1b-2c3d");

    expect(requests).toEqual([
      {
        url: "https://api.cloudflare.com/client/v4/accounts/account-id/pages/projects/mtv-tv/deployments/0a1b-2c3d/rollback",
        init: { method: "POST", headers: { Authorization: "Bearer api-token" } },
      },
    ]);
  });

  it("explains a rollback the API refused", async () => {
    const fetch = async () =>
      Response.json({ success: false, errors: [{ code: 8000009, message: "deployment not found" }] }, { status: 404 });

    await expect(
      wranglerDeployer({ project: "mtv-tv", run: recorder().run, env: credentials, fetch }).promote("abc"),
    ).rejects.toThrow(/rollback recusado \(HTTP 404\): deployment not found/);
  });

  it("needs the API credentials and a plain id to roll back", async () => {
    const fetch = async () => Response.json({ success: true });
    const deployer = (env: Record<string, string>) => wranglerDeployer({ project: "mtv-tv", run: recorder().run, env, fetch });

    await expect(deployer({}).promote("abc")).rejects.toThrow(/CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID/);
    await expect(deployer(credentials).promote("../../x")).rejects.toThrow(/id de deploy inválido/);
  });
});
