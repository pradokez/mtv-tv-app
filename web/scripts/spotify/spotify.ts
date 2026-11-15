/**
 * Reads the user's liked songs from the Spotify Web API.
 *
 * Login is OAuth Authorization Code with PKCE (no client secret): the browser
 * opens the Spotify consent page, which redirects to a one-shot local server
 * on 127.0.0.1. Only the refresh token is kept, in a git-ignored cache file.
 * Spotify no longer returns artist genres to new apps (403 on `/artists?ids=`,
 * and no `genres` field on `/artists/{id}`), so genres come from MusicBrainz
 * (see `musicbrainz.ts`).
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const AUTHORIZE = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";
export const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SCOPE = "user-library-read";

export interface LikedTrack {
  /** Spotify track id. */
  id: string;
  artist: string;
  /** Each credited artist's name, for the genre lookup. */
  artistNames: string[];
  song: string;
  /** Release year of the album. */
  year?: number;
  /** Genres of the credited artists (empty until looked up). */
  genres: string[];
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface Token {
  refreshToken: string;
}

const base64url = (buffer: Buffer) => buffer.toString("base64url");

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(64));
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

async function tokenRequest(body: Record<string, string>, fetchFn: Fetch): Promise<{ access_token: string; refresh_token?: string }> {
  const response = await fetchFn(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = (await response.json().catch(() => undefined)) as { access_token?: string; refresh_token?: string; error_description?: string } | undefined;
  if (!response.ok || !data?.access_token) {
    throw new Error(`o Spotify recusou o login (HTTP ${response.status}${data?.error_description ? `: ${data.error_description}` : ""})`);
  }
  return { access_token: data.access_token, ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}) };
}

/** Waits for the redirect on the local server and returns the authorization code. */
function waitForCode(state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", REDIRECT_URI);
      if (url.pathname !== new URL(REDIRECT_URI).pathname) {
        response.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const ok = code !== null && url.searchParams.get("state") === state;
      response.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(ok ? "Pronto! Pode fechar esta aba e voltar ao terminal." : "Login recusado ou inválido. Volte ao terminal.");
      server.close();
      if (ok) resolve(code);
      else reject(new Error(`o Spotify não autorizou (${url.searchParams.get("error") ?? "resposta inválida"})`));
    });
    server.on("error", reject);
    server.listen(Number(new URL(REDIRECT_URI).port), "127.0.0.1");
  });
}

/** An access token: from the saved refresh token, or after a browser login. */
export async function getAccessToken(options: { clientId: string; tokenPath: string; openUrl: (url: string) => void; fetch?: Fetch }): Promise<string> {
  const { clientId, tokenPath, openUrl, fetch: fetchFn = globalThis.fetch } = options;
  if (existsSync(tokenPath)) {
    const saved = JSON.parse(readFileSync(tokenPath, "utf8")) as Partial<Token>;
    if (saved.refreshToken) {
      try {
        const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: saved.refreshToken, client_id: clientId }, fetchFn);
        if (fresh.refresh_token) save(tokenPath, { refreshToken: fresh.refresh_token });
        return fresh.access_token;
      } catch {
        console.log("O login salvo não vale mais, abrindo o Spotify de novo…");
      }
    }
  }

  const { verifier, challenge } = pkcePair();
  const state = base64url(randomBytes(16));
  const url = new URL(AUTHORIZE);
  for (const [key, value] of Object.entries({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  })) {
    url.searchParams.set(key, value);
  }
  const code = waitForCode(state);
  console.log(`Autorize no navegador (se ele não abrir, acesse):\n${url.toString()}`);
  openUrl(url.toString());
  const granted = await tokenRequest(
    { grant_type: "authorization_code", code: await code, redirect_uri: REDIRECT_URI, client_id: clientId, code_verifier: verifier },
    fetchFn,
  );
  if (granted.refresh_token) save(tokenPath, { refreshToken: granted.refresh_token });
  return granted.access_token;
}

function save(path: string, token: Token): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(token), { mode: 0o600 });
}

async function get<T>(path: string, accessToken: string, fetchFn: Fetch): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetchFn(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 429 && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, (Number(response.headers.get("Retry-After")) || 1) * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`o Spotify respondeu HTTP ${response.status} em ${path.split("?")[0]}`);
    return (await response.json()) as T;
  }
}

interface ApiTrackItem {
  track?: { id?: string | null; name?: string; is_local?: boolean; artists?: { id?: string | null; name?: string }[]; album?: { release_date?: string } } | null;
}

/** The liked track as we use it; undefined for local files and entries without the essentials. */
export function toLikedTrack(item: ApiTrackItem): LikedTrack | undefined {
  const t = item.track;
  if (!t || t.is_local || !t.id || !t.name || !t.artists?.length) return undefined;
  const year = Number(t.album?.release_date?.slice(0, 4));
  return {
    id: t.id,
    artist: t.artists.map((a) => a.name).filter(Boolean).join(", ") || "",
    artistNames: t.artists.map((a) => a.name).filter((name): name is string => Boolean(name)),
    song: t.name,
    ...(Number.isInteger(year) && year > 0 ? { year } : {}),
    genres: [],
  };
}

/** All liked tracks (genres are empty: see `musicbrainz.ts`). */
export async function fetchLikedTracks(accessToken: string, options: { fetch?: Fetch } = {}): Promise<LikedTrack[]> {
  const { fetch: fetchFn = globalThis.fetch } = options;
  const tracks: LikedTrack[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await get<{ items?: ApiTrackItem[]; next?: string | null }>(`/me/tracks?limit=50&offset=${offset}`, accessToken, fetchFn);
    for (const item of page.items ?? []) {
      const track = toLikedTrack(item);
      if (track) tracks.push(track);
    }
    if (!page.next) break;
  }
  return tracks;
}
