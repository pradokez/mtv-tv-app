import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CatalogError, parseCatalog } from "./catalog";

const snapshot = () => ({
  schemaVersion: 1,
  channels: [
    { id: "90s", name: "90s", icon: "icons/90s.png", order: 1, videoIds: ["c"] },
    { id: "80s", name: "80s", icon: "icons/80s.png", order: 0, videoIds: ["a", "b"] },
  ],
  videos: {
    a: { durationSec: 200, artist: "a-ha", song: "Take On Me" },
    b: { title: "Some original YouTube title" },
    c: {},
  },
});

describe("parseCatalog", () => {
  it("lists channels sorted by order", () => {
    const catalog = parseCatalog(snapshot());

    expect(catalog.channels().map((c) => c.id)).toEqual(["80s", "90s"]);
  });

  it("looks up channels and videos by id", () => {
    const catalog = parseCatalog(snapshot());

    expect(catalog.channel("90s")?.name).toBe("90s");
    expect(catalog.video("a")).toEqual({ durationSec: 200, artist: "a-ha", song: "Take On Me" });
  });

  it("returns undefined for unknown ids", () => {
    const catalog = parseCatalog(snapshot());

    expect(catalog.channel("nope")).toBeUndefined();
    expect(catalog.video("nope")).toBeUndefined();
    expect(catalog.video("toString")).toBeUndefined();
  });

  it("rejects a snapshot with an incompatible schema version", () => {
    const v2 = { ...snapshot(), schemaVersion: 2 };

    expect(() => parseCatalog(v2)).toThrow(CatalogError);
    expect(() => parseCatalog(v2)).toThrow("Catálogo com esquema v2; este app entende v1");
  });

  it("rejects a snapshot without a schema version", () => {
    const { schemaVersion: _, ...unversioned } = snapshot();

    expect(() => parseCatalog(unversioned)).toThrow(/sem versão de esquema/);
  });

  it.each([
    ["not an object", "oops"],
    ["channels missing", { schemaVersion: 1, videos: {} }],
    ["videos missing", { schemaVersion: 1, channels: [] }],
    [
      "a channel without videoIds",
      { schemaVersion: 1, videos: {}, channels: [{ id: "x", name: "X", icon: "", order: 0 }] },
    ],
  ])("rejects a malformed snapshot (%s)", (_, input) => {
    expect(() => parseCatalog(input)).toThrow(CatalogError);
  });

  it("skips video ids without metadata and omits channels left empty", () => {
    const input = snapshot();
    input.channels[0]!.videoIds = ["ghost"];
    input.channels[1]!.videoIds = ["a", "ghost", "b"];

    const catalog = parseCatalog(input);

    expect(catalog.channels().map((c) => c.id)).toEqual(["80s"]);
    expect(catalog.channel("80s")?.videoIds).toEqual(["a", "b"]);
    expect(catalog.channel("90s")).toBeUndefined();
  });

  it("accepts the bundled sample catalog", () => {
    const sample = JSON.parse(readFileSync(new URL("../../fixtures/catalog.example.json", import.meta.url), "utf8"));

    const catalog = parseCatalog(sample);

    // Nothing was dropped: every channel and video id in the file is usable.
    expect(catalog.channels()).toHaveLength(sample.channels.length);
    expect(catalog.channels().length).toBeGreaterThan(0);
    for (const channel of sample.channels) {
      expect(catalog.channel(channel.id)?.videoIds).toEqual(channel.videoIds);
      for (const id of channel.videoIds) expect(catalog.video(id)).toBeDefined();
    }
  });
});
