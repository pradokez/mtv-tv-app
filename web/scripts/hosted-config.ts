import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Build-time config: the hosted app's domain and base path live in the versioned
// config/hosted.json (the site is public, so the address is no secret). GitHub Pages serves
// a repository under https://<user>.github.io/<repo>/, hence the path.
// From it we derive the Tizen config.xml and hand the same URL to the Android build.

export const CONFIG_PATH =
  process.env.HOSTED_CONFIG_PATH ?? fileURLToPath(new URL("../../config/hosted.json", import.meta.url));
const TIZEN_TEMPLATE_PATH = fileURLToPath(new URL("../../tizen/config.template.xml", import.meta.url));

// Video streams come from rotating hosts (rr3---sn-xxxx.googlevideo.com):
// only this origin is allowed with its subdomains.
const VIDEO_STREAMS_ORIGIN = "https://googlevideo.com";

// The only other origins the shells may reach: the YouTube player, its assets
// and its video streams.
const YOUTUBE_ORIGINS = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://i.ytimg.com",
  "https://s.ytimg.com",
  VIDEO_STREAMS_ORIGIN,
];

export interface HostedConfig {
  domain: string;
  /** Base path of the app on the domain: starts and ends with "/" (e.g. "/mtv-tv-app/"). */
  path: string;
}

// "/" or "/segment/segment/": plain URL-safe segments, so no "..", no encoding tricks.
const BASE_PATH = /^\/([A-Za-z0-9_~-][A-Za-z0-9._~-]*\/)*$/;

export function loadHostedConfig(file: string = CONFIG_PATH): HostedConfig {
  if (!existsSync(file)) {
    throw new Error(
      `Configuração não encontrada: ${file}\n` +
        `Crie config/hosted.json com {"domain": "meu-usuario.github.io", "path": "/meu-repo/"}.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${file} não é um JSON válido.`);
  }
  const { domain, path } = (raw ?? {}) as Partial<HostedConfig>;
  if (typeof domain !== "string" || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(domain)) {
    throw new Error(`${file}: "domain" deve ser só o domínio, sem https:// nem barras (ex.: meu-app.pages.dev).`);
  }
  if (typeof path !== "string" || !BASE_PATH.test(path)) {
    throw new Error(`${file}: "path" deve começar e terminar com "/" (ex.: "/mtv-tv-app/", ou "/" na raiz do domínio).`);
  }
  return { domain, path };
}

export function hostedUrl({ domain, path }: HostedConfig): string {
  return `https://${domain}${path}`;
}

/** The widget opens this local page, which loads the hosted URL (Tizen has no load-error hook for a remote `content src`). */
const LAUNCHER_ENTRY = "index.html";

export interface TizenConfigOptions {
  /** `content src` of the widget. */
  contentSrc: string;
  /** Origins the widget may reach, one `<access>` each. */
  accessOrigins: string[];
}

export function tizenOptionsFor(config: HostedConfig): TizenConfigOptions {
  return {
    contentSrc: LAUNCHER_ENTRY,
    accessOrigins: [`https://${config.domain}`, ...YOUTUBE_ORIGINS],
  };
}

/** Fills the checked-in config.xml template (placeholders __CONTENT_SRC__ and __ACCESS__). */
export function renderTizenConfig(template: string, { contentSrc, accessOrigins }: TizenConfigOptions): string {
  const access = accessOrigins
    .map((origin) => `<access origin="${origin}" subdomains="${origin === VIDEO_STREAMS_ORIGIN}"/>`)
    .join("\n  ");
  return template.replace("__CONTENT_SRC__", contentSrc).replace("__ACCESS__", access);
}

// CLI: `node hosted-config.ts tizen-config [--test]` prints the config.xml,
//      `node hosted-config.ts launcher-config` prints the config.js the Tizen launcher reads (the hosted URL),
//      `node hosted-config.ts android-url` prints the URL for the Android build.
function main(args: string[]): void {
  const [command, flag] = args;
  try {
    if (command === "android-url") {
      process.stdout.write(hostedUrl(loadHostedConfig()));
    } else if (command === "launcher-config") {
      process.stdout.write(`window.MTV_URL = ${JSON.stringify(hostedUrl(loadHostedConfig()))};\n`);
    } else if (command === "tizen-config") {
      const template = readFileSync(TIZEN_TEMPLATE_PATH, "utf8");
      // The test page (--test) is local and needs no hosted address.
      const options =
        flag === "--test"
          ? { contentSrc: "index.html", accessOrigins: YOUTUBE_ORIGINS }
          : tizenOptionsFor(loadHostedConfig());
      process.stdout.write(renderTizenConfig(template, options));
    } else {
      throw new Error("Uso: hosted-config.ts <tizen-config [--test] | launcher-config | android-url>");
    }
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
