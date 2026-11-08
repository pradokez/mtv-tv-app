import { describe, expect, it } from "vitest";
import type { ChannelSnapshot } from "../catalog/schema";
import { guideRows } from "./guide";

const channel = (id: string, order: number): ChannelSnapshot => ({ id, name: id.toUpperCase(), icon: "🎵", order, videoIds: ["v"] });
const channels = [channel("a", 0), channel("b", 1), channel("c", 2)];

describe("guideRows", () => {
  it("starts with the filter row, then all channels in order without favorites", () => {
    const rows = guideRows(channels, [], false);

    expect(rows.map((r) => (r.kind === "filter" ? "filter" : r.id))).toEqual(["filter", "a", "b", "c"]);
    expect(rows[0]).toEqual({ kind: "filter", on: false, ignored: false });
  });

  it("puts favorites at the top, once, in catalog order", () => {
    const rows = guideRows(channels, ["c", "b"], false);

    expect(rows.map((r) => (r.kind === "filter" ? "filter" : `${r.id}${r.favorite ? "*" : ""}`))).toEqual([
      "filter",
      "b*",
      "c*",
      "a",
    ]);
  });

  it("flags the filter as ignored when it is on and there are no favorites", () => {
    expect(guideRows(channels, [], true)[0]).toEqual({ kind: "filter", on: true, ignored: true });
    expect(guideRows(channels, ["a"], true)[0]).toEqual({ kind: "filter", on: true, ignored: false });
  });

  it("ignores favorite ids that are no longer in the catalog", () => {
    expect(guideRows(channels, ["gone"], true)[0]).toEqual({ kind: "filter", on: true, ignored: true });
  });
});
