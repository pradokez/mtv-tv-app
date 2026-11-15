import { describe, expect, it } from "vitest";
import { CATALOG_SCHEMA_VERSION } from "../../src/catalog/schema.ts";
import { build, noMetaLookup, type BuildInput, type MetaLookup, type SearchEntry, type VideoLookup } from "./build.ts";

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

/** A fake metadata source that knows only `known` and spends no quota. */
const lookupOf =
  (known: Record<string, VideoLookup>): MetaLookup =>
  async () => ({ found: new Map(Object.entries(known)), quotaUnits: 0 });

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

  it("merges the duration from the metadata lookup into each video", async () => {
    const { catalog } = await build(input({ metaLookup: lookupOf({ [A]: { durationSec: 225 } }) }));

    expect(catalog.videos[A]).toEqual({ artist: "a-ha", song: "Take On Me", durationSec: 225 });
  });

  it("asks the metadata lookup once, for each distinct video", async () => {
    const asked: string[][] = [];
    await build(
      input({
        playlists: { "80s": [A, B], "90s": [B, C] },
        metaLookup: async (ids) => {
          asked.push([...ids]);
          return { found: new Map(), quotaUnits: 0 };
        },
      }),
    );

    expect(asked).toEqual([[A, B, C]]);
  });

  it("removes discarded videos from their channels and from the videos map", async () => {
    const { catalog, report } = await build(
      input({
        playlists: { "80s": [A, B, D], "90s": [C, B] },
        metaLookup: lookupOf({
          [A]: { durationSec: 225 },
          [B]: { discard: "não embutível" },
          [C]: { durationSec: 213 },
          [D]: { discard: "privado ou removido" },
        }),
      }),
    );

    expect(catalog.channels.map((c) => c.videoIds)).toEqual([[A], [C]]);
    expect(Object.keys(catalog.videos).sort()).toEqual([A, C].sort());
    expect(report.videos).toBe(2);
    expect(report.metadata).toEqual({ artistAndSong: 2, titleOnly: 0, none: 0 });
  });

  it("omits channels left empty by discards and keeps the order contiguous", async () => {
    const base = input();
    const { catalog, report } = await build({
      ...base,
      playlists: { "80s": [A, B], "90s": [C], "00s": [D] },
      channelConfig: {
        info: { ...base.channelConfig.info, "00s": { name: "00s", icon: "📀" } },
        sections: [{ id: "decades", channels: ["80s", "90s", "00s"] }],
      },
      metaLookup: lookupOf({ [A]: { discard: "sem duração" }, [B]: { discard: "sem duração" } }),
    });

    expect(catalog.channels.map((c) => [c.id, c.order])).toEqual([
      ["90s", 0],
      ["00s", 1],
    ]);
    expect(report.droppedChannels).toEqual([{ id: "80s", reason: "vazio" }]);
  });

  it("counts discarded videos by reason and the quota used", async () => {
    const { report } = await build(
      input({
        playlists: { "80s": [A, B, C, D] },
        metaLookup: async () => ({
          found: new Map<string, VideoLookup>([
            [A, { discard: "privado ou removido" }],
            [B, { discard: "privado ou removido" }],
            [C, { discard: "não embutível" }],
          ]),
          quotaUnits: 7,
        }),
      }),
    );

    expect(report.discardedVideos).toEqual({ "privado ou removido": 2, "não embutível": 1, "sem duração": 0 });
    expect(report.quotaUnits).toBe(7);
    expect(report.videos).toBe(1);
  });

  it("discards nothing and spends no quota without a metadata source", async () => {
    const { report } = await build(input());

    expect(report.discardedVideos).toEqual({ "privado ou removido": 0, "não embutível": 0, "sem duração": 0 });
    expect(report.quotaUnits).toBe(0);
  });

  it("ignores the year in the search index (it is the upload year)", async () => {
    const { catalog } = await build(input({ searchIndex: [entry(A, { a: "a-ha", s: "Take On Me", y: "2016" })] }));

    expect(catalog.videos[A]).toEqual({ artist: "a-ha", song: "Take On Me" });
    expect(JSON.stringify(catalog)).not.toContain("2016");
  });

  describe("commercials", () => {
    const X = "Kw_gPddlzLM";
    const Y = "NatlghQ18Mo";
    const curated = (id: string) => ({ id, brand: "Marca", title: `Título ${id}`, year: 1990 });

    it("puts curated commercials with their duration in the snapshot, never as a channel", async () => {
      const { catalog, report } = await build(
        input({
          commercials: [curated(X), curated(Y)],
          metaLookup: lookupOf({ [X]: { durationSec: 30 }, [Y]: { durationSec: 45 } }),
        }),
      );

      expect(catalog.commercials).toEqual([
        { id: X, brand: "Marca", title: `Título ${X}`, year: 1990, durationSec: 30 },
        { id: Y, brand: "Marca", title: `Título ${Y}`, year: 1990, durationSec: 45 },
      ]);
      expect(catalog.channels.map((c) => c.id)).toEqual(["80s", "90s"]);
      expect(catalog.videos[X]).toBeUndefined();
      expect(report.commercials.kept).toBe(2);
    });

    it("asks for the commercials' metadata in the same lookup as the clips", async () => {
      const asked: string[][] = [];
      const metaLookup: MetaLookup = async (ids) => {
        asked.push([...ids]);
        return { found: new Map(), quotaUnits: 0 };
      };

      await build(input({ commercials: [curated(X)], metaLookup }));

      expect(asked).toHaveLength(1);
      expect(asked[0]).toEqual(expect.arrayContaining([A, B, C, X]));
    });

    it("drops unplayable commercials and those without a known duration, and counts them apart from the clips", async () => {
      const { catalog, report } = await build(
        input({
          commercials: [curated(X), curated(Y), curated("aaaaaaaaaaa")],
          metaLookup: lookupOf({ [X]: { discard: "não embutível" }, [Y]: { durationSec: 30 } }),
        }),
      );

      expect(catalog.commercials?.map((c) => c.id)).toEqual([Y]);
      expect(report.commercials).toEqual({
        kept: 1,
        discarded: { "privado ou removido": 0, "não embutível": 1, "sem duração": 1 },
      });
      expect(report.discardedVideos["não embutível"]).toBe(0);
    });

    it("warns about a commercial longer than 90 seconds (maybe a compilation)", async () => {
      const { report } = await build(
        input({ commercials: [curated(X)], metaLookup: lookupOf({ [X]: { durationSec: 600 } }) }),
      );

      expect(report.warnings).toContainEqual(expect.stringContaining(X));
    });

    it("still drops the site's own commercials channel", async () => {
      const { catalog } = await build(
        input({ playlists: { "80s": [A], commercials: [B] }, commercials: [curated(X)], metaLookup: lookupOf({ [X]: { durationSec: 30 } }) }),
      );

      expect(catalog.channels.map((c) => c.id)).toEqual(["80s"]);
      expect(catalog.commercials?.map((c) => c.id)).toEqual([X]);
    });

    it("omits the field when there is no curated list", async () => {
      const { catalog, report } = await build(input());

      expect(catalog.commercials).toBeUndefined();
      expect(report.commercials.kept).toBe(0);
    });
  });

  describe("own channels", () => {
    const X = "Jb2stN7kH28";
    const Y = "8xg3vE8Ie_E";
    const own = (fields = {}) => ({
      id: "taylor-swift",
      name: "Taylor Swift",
      icon: "🦋",
      afterSection: "decades",
      videos: [
        { id: X, artist: "Taylor Swift", song: "Our Song" },
        { id: Y, artist: "Taylor Swift", song: "Love Story" },
      ],
      ...fields,
    });

    it("puts the channel right after the last channel of its section, with its own artist and song", async () => {
      const { catalog } = await build(
        input({
          playlists: { "80s": [A], "90s": [C], rock: [D] },
          channelConfig: {
            info: { "80s": { name: "80s", icon: "📼" }, "90s": { name: "90s", icon: "💿" }, rock: { name: "Rock", icon: "🎸" } },
            sections: [
              { id: "decades", channels: ["80s", "90s"] },
              { id: "curated", channels: ["rock"] },
            ],
          },
          ownChannels: [own()],
          metaLookup: lookupOf({ [X]: { durationSec: 200 }, [Y]: { durationSec: 230 } }),
        }),
      );

      expect(catalog.channels.map((c) => [c.id, c.order])).toEqual([["80s", 0], ["90s", 1], ["taylor-swift", 2], ["rock", 3]]);
      expect(catalog.channels[2]).toMatchObject({ name: "Taylor Swift", icon: "🦋", videoIds: [X, Y] });
      expect(catalog.videos[X]).toEqual({ artist: "Taylor Swift", song: "Our Song", durationSec: 200 });
    });

    it("goes to the end when the section does not exist", async () => {
      const { catalog } = await build(input({ ownChannels: [own({ afterSection: "nope" })] }));

      expect(catalog.channels.map((c) => c.id)).toEqual(["80s", "90s", "taylor-swift"]);
    });

    it("drops unplayable clips and the channel itself when none is left", async () => {
      const { catalog, report } = await build(
        input({ ownChannels: [own()], metaLookup: lookupOf({ [X]: { discard: "não embutível" }, [Y]: { discard: "privado ou removido" } }) }),
      );

      expect(catalog.channels.map((c) => c.id)).not.toContain("taylor-swift");
      expect(report.droppedChannels).toContainEqual({ id: "taylor-swift", reason: "vazio" });
    });

    it("ignores a channel whose id the site already uses, with a warning", async () => {
      const { catalog, report } = await build(input({ ownChannels: [own({ id: "80s" })] }));

      expect(catalog.channels.find((c) => c.id === "80s")?.videoIds).toEqual([A, B]);
      expect(report.warnings).toEqual([expect.stringContaining("80s")]);
    });
  });
  describe("liked clips", () => {
    const L1 = "xKCek6_dB0M";
    const L2 = "Jb2stN7kH28";
    const withAll = (overrides: Partial<BuildInput> = {}) =>
      input({
        playlists: { "80s": [A, B], "90s": [C], all: [D] },
        channelConfig: {
          info: { "80s": { name: "80s", icon: "📼" }, "90s": { name: "90s", icon: "💿" }, all: { name: "SHUFFLE ALL", icon: "🔀" } },
          sections: [{ id: "decades", channels: ["80s", "90s"] }, { id: "other", channels: ["all"] }],
        },
        ...overrides,
      });

    it("adds a clip to every existing channel it fits, creating no channel", async () => {
      const { catalog, report } = await build(withAll({ likedClips: [{ id: L1, artist: "Nirvana", song: "Lithium", channels: ["90s", "grunge"] }] }));

      expect(catalog.channels.map((c) => c.id)).toEqual(["80s", "90s", "all"]);
      expect(catalog.channels.find((c) => c.id === "90s")?.videoIds).toEqual([C, L1]);
      expect(catalog.channels.find((c) => c.id === "all")?.videoIds).toEqual([D]);
      expect(catalog.videos[L1]).toEqual({ artist: "Nirvana", song: "Lithium" });
      expect(report.likedClips).toEqual({ clips: 1, placements: 1, onlyAll: 0, noChannel: 0 });
    });

    it("sends a clip that fits no existing channel only to all", async () => {
      const { catalog, report } = await build(withAll({ likedClips: [{ id: L2, artist: "Édith Piaf", song: "La Vie en Rose", channels: ["jazz"] }] }));

      expect(catalog.channels.find((c) => c.id === "all")?.videoIds).toEqual([D, L2]);
      expect(report.likedClips).toEqual({ clips: 1, placements: 1, onlyAll: 1, noChannel: 0 });
    });

    it("leaves a clip out when it fits nothing and the site has no all channel", async () => {
      const { catalog, report } = await build(input({ likedClips: [{ id: L2, artist: "x", song: "y", channels: ["jazz"] }] }));

      expect(catalog.videos[L2]).toBeUndefined();
      expect(report.likedClips).toEqual({ clips: 0, placements: 0, onlyAll: 0, noChannel: 1 });
    });

    it("does not repeat a clip the channel already has and keeps the site's tarja", async () => {
      const { catalog, report } = await build(input({ likedClips: [{ id: A, artist: "Someone Else", song: "Other", channels: ["80s"] }] }));

      expect(catalog.channels.find((c) => c.id === "80s")?.videoIds).toEqual([A, B]);
      expect(catalog.videos[A]).toEqual({ artist: "a-ha", song: "Take On Me" });
      expect(report.likedClips.placements).toBe(0);
    });

    it("drops an unplayable liked clip like any other video", async () => {
      const { catalog } = await build(
        withAll({ likedClips: [{ id: L1, artist: "n", song: "l", channels: ["90s"] }], metaLookup: lookupOf({ [L1]: { discard: "não embutível" } }) }),
      );

      expect(catalog.channels.find((c) => c.id === "90s")?.videoIds).toEqual([C]);
      expect(catalog.videos[L1]).toBeUndefined();
    });

    it("warns about and ignores an invalid id", async () => {
      const { report } = await build(withAll({ likedClips: [{ id: "curto", artist: "n", song: "l", channels: ["90s"] }] }));

      expect(report.warnings).toEqual([expect.stringContaining("curto")]);
    });
  });
});
