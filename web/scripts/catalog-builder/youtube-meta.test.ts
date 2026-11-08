import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createYouTubeMetaLookup, parseIsoDuration } from "./youtube-meta.ts";

const API_KEY = "test-key-123";

/** 11-character fake YouTube ids: v0000000000, v0000000001, ... */
const ids = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => `v${String(from + i).padStart(10, "0")}`);

interface FakeItem {
  id: string;
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
}

const playable = (id: string, duration = "PT3M45S"): FakeItem => ({
  id,
  contentDetails: { duration },
  status: { embeddable: true, privacyStatus: "public" },
});

/** A fake `videos.list`: answers from `items` (default: every id playable) and records each call. */
function fakeApi(items: (id: string) => FakeItem | undefined = (id) => playable(id)) {
  const calls: URL[] = [];
  let failOnCall: number | undefined;
  const fetch = async (url: string): Promise<Response> => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (calls.length === failOnCall) {
      return Response.json(
        { error: { code: 403, message: "The request cannot be completed because you have exceeded your quota." } },
        { status: 403 },
      );
    }
    const requested = parsed.searchParams.get("id")?.split(",") ?? [];
    return Response.json({ items: requested.map(items).filter(Boolean) });
  };
  return {
    fetch,
    calls,
    requestedIds: () => calls.map((c) => c.searchParams.get("id")?.split(",") ?? []),
    failOn: (call: number) => {
      failOnCall = call;
    },
  };
}

let dir: string;
let cachePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "youtube-meta-"));
  cachePath = join(dir, "nested", "youtube-meta.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("createYouTubeMetaLookup", () => {
  it("queries the API in batches of 50 ids, one quota unit per call", async () => {
    const api = fakeApi();
    const lookup = createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: api.fetch });

    const { found, quotaUnits } = await lookup(ids(120));

    expect(api.requestedIds().map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(api.requestedIds().flat()).toEqual(ids(120));
    expect(quotaUnits).toBe(3);
    expect(found.size).toBe(120);
    expect(found.get(ids(1)[0]!)).toEqual({ durationSec: 225 });
  });

  it("asks only for duration and status, with the key in the query", async () => {
    const api = fakeApi();
    await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: api.fetch })(ids(1));

    const url = api.calls[0]!;
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/youtube/v3/videos");
    expect(url.searchParams.get("part")).toBe("contentDetails,status");
    expect(url.searchParams.get("key")).toBe(API_KEY);
  });

  it("reuses the disk cache on the next run and queries only new ids", async () => {
    const first = fakeApi();
    await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: first.fetch })(ids(60));

    const second = fakeApi();
    const { found, quotaUnits } = await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: second.fetch })(
      ids(70),
    );

    expect(second.requestedIds()).toEqual([ids(10, 60)]);
    expect(quotaUnits).toBe(1);
    expect(found.size).toBe(70);
  });

  it("makes no call when every id is cached", async () => {
    await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: fakeApi().fetch })(ids(5));

    const again = fakeApi();
    const { found, quotaUnits } = await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: again.fetch })(
      ids(5),
    );

    expect(again.calls).toEqual([]);
    expect(quotaUnits).toBe(0);
    expect(found.size).toBe(5);
  });

  it("keeps finished batches when a later one fails, and resumes from there", async () => {
    const failing = fakeApi();
    failing.failOn(2);
    const lookup = createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: failing.fetch });

    await expect(lookup(ids(120))).rejects.toThrow(/HTTP 403.*exceeded your quota/);

    const resumed = fakeApi();
    const { found, quotaUnits } = await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: resumed.fetch })(
      ids(120),
    );
    expect(resumed.requestedIds()).toEqual([ids(50, 50), ids(20, 100)]);
    expect(quotaUnits).toBe(2);
    expect(found.size).toBe(120);
  });

  it("never puts the key in the error message or in the cache", async () => {
    const api = fakeApi();
    api.failOn(2);
    const lookup = createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: api.fetch });

    const error: unknown = await lookup(ids(60)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(API_KEY);
    expect(readFileSync(cachePath, "utf8")).not.toContain(API_KEY);
  });

  it("does not leak the key when the request itself fails", async () => {
    const lookup = createYouTubeMetaLookup({
      apiKey: API_KEY,
      cachePath,
      fetch: async (url) => {
        throw new TypeError(`fetch failed for ${url}`);
      },
    });

    const error: unknown = await lookup(ids(1)).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(/YouTube Data API/);
    expect((error as Error).message).not.toContain(API_KEY);
  });

  it("discards private, removed, non-embeddable and duration-less videos, by reason", async () => {
    const [ok, priv, removed, blocked, live, zero, garbage] = ids(7);
    const api = fakeApi((id) => {
      if (id === removed) return undefined;
      if (id === priv) return { ...playable(id), status: { embeddable: true, privacyStatus: "private" } };
      if (id === blocked) return { ...playable(id), status: { embeddable: false, privacyStatus: "public" } };
      if (id === live) return playable(id, "P0D");
      if (id === zero) return { ...playable(id), contentDetails: {} };
      if (id === garbage) return playable(id, "soon");
      return playable(id, "PT1H2M3S");
    });

    const { found } = await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: api.fetch })(ids(7));

    expect(Object.fromEntries(found)).toEqual({
      [ok!]: { durationSec: 3723 },
      [priv!]: { discard: "privado ou removido" },
      [removed!]: { discard: "privado ou removido" },
      [blocked!]: { discard: "não embutível" },
      [live!]: { discard: "sem duração" },
      [zero!]: { discard: "sem duração" },
      [garbage!]: { discard: "sem duração" },
    });
  });

  it("caches discards too, so they are not queried again", async () => {
    const [gone] = ids(1);
    await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: fakeApi(() => undefined).fetch })([gone!]);

    const again = fakeApi();
    const { found } = await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: again.fetch })([gone!]);

    expect(again.calls).toEqual([]);
    expect(found.get(gone!)).toEqual({ discard: "privado ou removido" });
  });

  it("treats ids that look like object keys as ordinary ids", async () => {
    const api = fakeApi();
    const { found } = await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: api.fetch })(["constructor"]);

    expect(api.requestedIds()).toEqual([["constructor"]]);
    expect(found.get("constructor")).toEqual({ durationSec: 225 });
  });

  it("writes the cache atomically, leaving no temporary file behind", async () => {
    await createYouTubeMetaLookup({ apiKey: API_KEY, cachePath, fetch: fakeApi().fetch })(ids(3));

    expect(JSON.parse(readFileSync(cachePath, "utf8"))).toEqual(
      Object.fromEntries(ids(3).map((id) => [id, { durationSec: 225 }])),
    );
    expect(existsSync(`${cachePath}.tmp`)).toBe(false);
  });

  it("refuses a corrupt cache with a clear message", async () => {
    const path = join(dir, "broken.json");
    writeFileSync(path, "{ not json");

    const lookup = createYouTubeMetaLookup({ apiKey: API_KEY, cachePath: path, fetch: fakeApi().fetch });

    await expect(lookup(ids(1))).rejects.toThrow(/cache.*broken\.json/);
  });
});

describe("parseIsoDuration", () => {
  it.each([
    ["PT3M45S", 225],
    ["PT1H2M3S", 3723],
    ["PT45S", 45],
    ["PT4M", 240],
    ["PT1H", 3600],
    ["P1DT1S", 86401],
    ["P0D", 0],
  ])("%s is %i seconds", (iso, seconds) => {
    expect(parseIsoDuration(iso)).toBe(seconds);
  });

  it.each(["", "soon", "PT", "3M45S", "P1W"])("%j is not a duration", (iso) => {
    expect(parseIsoDuration(iso)).toBeUndefined();
  });
});
