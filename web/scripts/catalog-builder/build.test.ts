import { describe, expect, it } from "vitest";
import { CATALOG_SCHEMA_VERSION } from "../../src/catalog/schema.ts";
import { build, noMetaLookup, type BuildInput, type SearchEntry } from "./build.ts";

// Valid 11-character YouTube ids.
const A = "djV11Xbc914";
const B = "W8r-tXRLazs";
const C = "dQw4w9WgXcQ";
const D = "hTWKbfoikeg";

const entry = (id: string, fields: Partial<SearchEntry> = {}): SearchEntry => ({
  id,
  a: "",
  s: "",
  t: "",
  y: "2011",
  ...fields,
});

function input(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    playlists: { "80s": [A, B], "90s": [C] },
    channelConfig: {
      info: {
        "80s": { name: "80s", icon: "📼" },
        "90s": { name: "90s", icon: "💿" },
      },
      sections: [{ id: "decades", channels: ["80s", "90s"] }],
    },
    searchIndex: [
      entry(A, { a: "a-ha", s: "Take On Me", t: "a-ha - Take On Me (Official Video)" }),
      entry(B, { a: "The Buggles", s: "Video Killed The Radio Star" }),
      entry(C, { a: "Rick Astley", s: "Never Gonna Give You Up" }),
    ],
    metaLookup: noMetaLookup,
    generatedAt: "2026-11-07T12:00:00.000Z",
    ...overrides,
  };
}

describe("build", () => {
  it("writes the schema version and takes channel names and icons from the config", async () => {
    const { catalog } = await build(input());

    expect(catalog.schemaVersion).toBe(CATALOG_SCHEMA_VERSION);
    expect(catalog.generatedAt).toBe("2026-11-07T12:00:00.000Z");
    expect(catalog.channels).toEqual([
      { id: "80s", name: "80s", icon: "📼", order: 0, videoIds: [A, B] },
      { id: "90s", name: "90s", icon: "💿", order: 1, videoIds: [C] },
    ]);
  });

  it("takes artist and song from the search index, without the original title", async () => {
    const { catalog } = await build(input());

    expect(catalog.videos[A]).toEqual({ artist: "a-ha", song: "Take On Me" });
  });

  it("uses only the original title when artist or song is missing", async () => {
    const { catalog } = await build(
      input({
        playlists: { "80s": [A, B, C] },
        searchIndex: [
          entry(A, { a: "a-ha", s: "  ", t: "a-ha - Take On Me" }),
          entry(B, { a: "", s: "Video Killed The Radio Star", t: " The Buggles - VKTRS " }),
          entry(C, { t: "" }),
        ],
      }),
    );

    expect(catalog.videos[A]).toEqual({ title: "a-ha - Take On Me" });
    expect(catalog.videos[B]).toEqual({ title: "The Buggles - VKTRS" });
    expect(catalog.videos[C]).toEqual({});
  });

  it("keeps videos missing from the search index, without metadata", async () => {
    const { catalog } = await build(input({ searchIndex: [] }));

    expect(catalog.channels[0]?.videoIds).toEqual([A, B]);
    expect(catalog.videos[A]).toEqual({});
  });

  it("drops malformed ids and repeats within a channel", async () => {
    const { catalog, report } = await build(
      input({ playlists: { "80s": [A, "nope", ` ${B} `, A, "djV11Xbc914x", "djV11Xbc91!", B], "90s": [A] } }),
    );

    expect(catalog.channels.map((c) => c.videoIds)).toEqual([[A, B], [A]]);
    expect(Object.keys(catalog.videos).sort()).toEqual([A, B].sort());
    expect(report.invalidIds).toBe(3);
    expect(report.duplicateIds).toBe(2);
  });

  it("omits channels left empty and channels without a config entry", async () => {
    const base = input();
    const { catalog, report } = await build({
      ...base,
      playlists: { "80s": [A], "90s": ["bad"], thisday: [], commercials: [B] },
      channelConfig: {
        ...base.channelConfig,
        info: { ...base.channelConfig.info, thisday: { name: "This day", icon: "📅" } },
      },
    });

    expect(catalog.channels.map((c) => c.id)).toEqual(["80s"]);
    expect(catalog.channels[0]?.order).toBe(0);
    expect(catalog.videos[B]).toBeUndefined();
    expect(report.droppedChannels).toEqual([
      { id: "90s", reason: "vazio" },
      { id: "thisday", reason: "vazio" },
      { id: "commercials", reason: "sem configuração" },
    ]);
  });

  it("orders channels by section, decades first, then unknown sections, then unsectioned channels", async () => {
    const ids = ["lbl", "dir", "cur", "dec", "new", "loose", "shw", "reg", "oth"];
    const { catalog } = await build({
      ...input(),
      playlists: Object.fromEntries(ids.map((id) => [id, [A]])),
      channelConfig: {
        info: Object.fromEntries(ids.map((id) => [id, { name: id, icon: "📺" }])),
        // The site's own order.
        sections: [
          { id: "curated", channels: ["cur"] },
          { id: "brandnew", channels: ["new"] },
          { id: "regional", channels: ["reg"] },
          { id: "directors", channels: ["dir"] },
          { id: "labels", channels: ["lbl"] },
          { id: "shows", channels: ["shw"] },
          { id: "decades", channels: ["dec"] },
          { id: "other", channels: ["oth"] },
        ],
      },
    });

    expect(catalog.channels.map((c) => c.id)).toEqual([
      "dec",
      "shw",
      "cur",
      "reg",
      "oth",
      "lbl",
      "dir",
      "new",
      "loose",
    ]);
    expect(catalog.channels.map((c) => c.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("replaces an HTML icon with an emoji and warns about it", async () => {
    const base = input();
    const { catalog, report } = await build({
      ...base,
      channelConfig: {
        ...base.channelConfig,
        info: { ...base.channelConfig.info, "90s": { name: "90s", icon: '<svg class="heart"><path d="M0"/></svg>' } },
      },
    });

    expect(catalog.channels[1]?.icon).toBe("💜");
    expect(report.warnings).toEqual(["canal 90s: ícone em HTML trocado por 💜"]);
  });

  it("reports channel, video and metadata counts", async () => {
    const { report } = await build(
      input({
        playlists: { "80s": [A, B, C], "90s": [A, D] },
        searchIndex: [entry(A, { a: "a-ha", s: "Take On Me" }), entry(B, { t: "Some title" })],
      }),
    );

    expect(report).toMatchObject({
      channels: 2,
      videos: 4,
      metadata: { artistAndSong: 1, titleOnly: 1, none: 2 },
    });
  });

  it("merges what the metadata lookup returns into each video", async () => {
    const { catalog } = await build(
      input({ metaLookup: async (ids) => new Map(ids.map((id) => [id, { durationSec: id.length * 10 }])) }),
    );

    expect(catalog.videos[A]).toEqual({ artist: "a-ha", song: "Take On Me", durationSec: 110 });
  });

  it("ignores the year in the search index (it is the upload year)", async () => {
    const { catalog } = await build(input({ searchIndex: [entry(A, { a: "a-ha", s: "Take On Me", y: "2016" })] }));

    expect(catalog.videos[A]).toEqual({ artist: "a-ha", song: "Take On Me" });
    expect(JSON.stringify(catalog)).not.toContain("2016");
  });
});
