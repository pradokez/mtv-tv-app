import { describe, expect, it } from "vitest";
import type { ChannelSnapshot } from "../catalog/schema";
import { guideRows, guideSection, type GuideRow } from "./guide";

const channel = (id: string, order: number): ChannelSnapshot => ({ id, name: id.toUpperCase(), icon: "🎵", order, videoIds: ["v"] });
const channels = [channel("a", 0), channel("b", 1), channel("c", 2)];

const label = (r: GuideRow) => (r.kind === "channel" ? `${r.id}${r.favorite ? "*" : ""}` : r.kind);

describe("guideRows", () => {
  it("starts with the settings rows, then all channels in order without favorites", () => {
    const rows = guideRows(channels, [], false, "live");

    expect(rows.map(label)).toEqual(["mode", "filter", "a", "b", "c"]);
    expect(rows[0]).toEqual({ kind: "mode", mode: "live" });
    expect(rows[1]).toEqual({ kind: "filter", on: false, ignored: false });
  });

  it("shows the current mode in the mode row", () => {
    expect(guideRows(channels, [], false, "queue")[0]).toEqual({ kind: "mode", mode: "queue" });
  });

  it("puts favorites at the top, once, in catalog order", () => {
    const rows = guideRows(channels, ["c", "b"], false, "live");

    expect(rows.map(label)).toEqual(["mode", "filter", "b*", "c*", "a"]);
  });

  it("flags the filter as ignored when it is on and there are no favorites", () => {
    expect(guideRows(channels, [], true, "live")[1]).toEqual({ kind: "filter", on: true, ignored: true });
    expect(guideRows(channels, ["a"], true, "live")[1]).toEqual({ kind: "filter", on: true, ignored: false });
  });

  it("ignores favorite ids that are no longer in the catalog", () => {
    expect(guideRows(channels, ["gone"], true, "live")[1]).toEqual({ kind: "filter", on: true, ignored: true });
  });
});

describe("guideSection", () => {
  const titles = (rows: GuideRow[]) => rows.map((row, i) => guideSection(row, rows[i - 1]));

  it("titles the settings, the favorites and the remaining channels", () => {
    expect(titles(guideRows(channels, ["b"], false, "live"))).toEqual([
      "// AJUSTES",
      undefined,
      "// FAVORITOS",
      "// TODOS OS CANAIS",
      undefined,
    ]);
  });

  it("skips the favorites title without favorites", () => {
    expect(titles(guideRows(channels, [], false, "live"))).toEqual([
      "// AJUSTES",
      undefined,
      "// TODOS OS CANAIS",
      undefined,
      undefined,
    ]);
  });

  it("skips the channels title when every channel is a favorite", () => {
    expect(titles(guideRows(channels, ["a", "b", "c"], false, "live")).slice(2)).toEqual([
      "// FAVORITOS",
      undefined,
      undefined,
    ]);
  });
});
