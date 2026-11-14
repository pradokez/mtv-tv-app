import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Build-time config: the hosted app's address (domain + secret token) lives only in
// a local, git-ignored file. From it we derive the Tizen config.xml and hand the same
// URL to the Android build. The URL must never be committed (see hosted-config.test.ts).

export const LOCAL_CONFIG_PATH =
  process.env.HOSTED_CONFIG_PATH ?? fileURLToPath(new URL("../../config/hosted.local.json", import.meta.url));
export const EXAMPLE_CONFIG_PATH = fileURLToPath(new URL("../../config/hosted.example.json", import.meta.url));
const TIZEN_TEMPLATE_PATH = fileURLToPath(new URL("../../tizen/config.template.xml", import.meta.url));

// The only other origins the shells may reach: the YouTube player and its assets.
const YOUTUBE_ORIGINS = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://i.ytimg.com",
  "https://s.ytimg.com",
];

export interface HostedConfig {
  domain: string;
  token: string;
}

export function loadHostedConfig(path: string = LOCAL_CONFIG_PATH): HostedConfig {
  if (!existsSync(path)) {
    throw new Error(
      `Configuração local não encontrada: ${path}\n` +
        `Copie config/hosted.example.json para config/hosted.local.json e preencha o domínio e o token.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${path} não é um JSON válido.`);
  }
  const { domain, token } = (raw ?? {}) as Partial<HostedConfig>;
  if (typeof domain !== "string" || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(domain)) {
    throw new Error(`${path}: "domain" deve ser só o domínio, sem https:// nem barras (ex.: meu-app.pages.dev).`);
  }
  if (typeof token !== "string" || !/^[A-Za-z0-9._~-]+$/.test(token)) {
    throw new Error(`${path}: "token" deve ter só letras, números, ".", "_", "~" ou "-".`);
  }
  return { domain, token };
}

export function hostedUrl({ domain, token }: HostedConfig): string {
  return `https://${domain}/${token}/`;
}

export interface TizenConfigOptions {
  /** `content src` of the widget. */
  contentSrc: string;
  /** Origins the widget may reach, one `<access>` each. */
  accessOrigins: string[];
}

export function tizenOptionsFor(config: HostedConfig): TizenConfigOptions {
  return {
    contentSrc: hostedUrl(config),
    accessOrigins: [`https://${config.domain}`, ...YOUTUBE_ORIGINS],
  };
}

/** Fills the checked-in config.xml template (placeholders __CONTENT_SRC__ and __ACCESS__). */
export function renderTizenConfig(template: string, { contentSrc, accessOrigins }: TizenConfigOptions): string {
  const access = accessOrigins.map((origin) => `<access origin="${origin}" subdomains="false"/>`).join("\n  ");
  return template.replace("__CONTENT_SRC__", contentSrc).replace("__ACCESS__", access);
}

// CLI: `node hosted-config.ts tizen-config [--test]` prints the config.xml,
//      `node hosted-config.ts android-url` prints the URL for the Android build.
function main(args: string[]): void {
  const [command, flag] = args;
  try {
    if (command === "android-url") {
      process.stdout.write(hostedUrl(loadHostedConfig()));
    } else if (command === "tizen-config") {
      const template = readFileSync(TIZEN_TEMPLATE_PATH, "utf8");
      // The test page (--test) is local and needs no hosted address.
      const options =
        flag === "--test"
          ? { contentSrc: "index.html", accessOrigins: YOUTUBE_ORIGINS }
          : tizenOptionsFor(loadHostedConfig());
      process.stdout.write(renderTizenConfig(template, options));
    } else {
      throw new Error("Uso: hosted-config.ts <tizen-config [--test] | android-url>");
    }
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
