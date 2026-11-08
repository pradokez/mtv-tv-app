import { describe, expect, it } from "vitest";
import { parseCatalog } from "../catalog/catalog";
import { createLiveSchedule } from "../schedule/live-schedule";
import { clipLabel, guideOnAir } from "./on-air";

const catalog = parseCatalog({
  schemaVersion: 1,
  channels: [
    { id: "solo", name: "Solo", icon: "", order: 0, videoIds: ["s"] },
    { id: "duo", name: "Duo", icon: "", order: 1, videoIds: ["x", "y"] },
    { id: "bare", name: "Bare", icon: "", order: 2, videoIds: ["nodur"] },
  ],
  videos: {
    s: { durationSec: 100, artist: "Nirvana", song: "Lithium" },
    x: { durationSec: 10, title: "Titulo X" },
    y: { durationSec: 20, artist: "Artist Y", song: "Song Y" },
    nodur: {},
  },
});
const schedule = createLiveSchedule(catalog);

describe("clipLabel", () => {
  it("prefers artist and song, then the title, then nothing", () => {
    expect(clipLabel({ artist: "A", song: "S" })).toBe("A – S");
    expect(clipLabel({ title: "T" })).toBe("T");
    expect(clipLabel({ artist: "A", title: "T" })).toBe("T");
    expect(clipLabel({})).toBeUndefined();
    expect(clipLabel(undefined)).toBeUndefined();
  });
});

describe("guideOnAir", () => {
  it("names the clip on air and the next one, with when the guide must refresh", () => {
    const now = 1_700_000_000_000;
    const slot = schedule.whatsOn("duo", now, 1)!;
    const info = guideOnAir(catalog, schedule, "duo", now)!;

    expect(info.videoId).toBe(slot.videoId);
    expect(info.now).toBe(clipLabel(catalog.video(slot.videoId)));
    expect(info.next).toBe(clipLabel(catalog.video(slot.upNext[0]!.videoId)));
    expect(info.endsAtMs).toBe(slot.endsAtMs);
  });

  it("changes when the clip ends", () => {
    const now = 1_700_000_000_000;
    const first = guideOnAir(catalog, schedule, "duo", now)!;
    const second = guideOnAir(catalog, schedule, "duo", first.endsAtMs)!;

    expect(second.videoId).not.toBe(first.videoId);
  });

  it("omits the next clip when it is the same one (single-video channel)", () => {
    const info = guideOnAir(catalog, schedule, "solo", 1_700_000_000_000)!;

    expect(info.now).toBe("Nirvana – Lithium");
    expect(info.next).toBeUndefined();
  });

  it("is undefined for channels without a grid", () => {
    expect(guideOnAir(catalog, schedule, "bare", 0)).toBeUndefined();
    expect(guideOnAir(catalog, schedule, "nope", 0)).toBeUndefined();
  });
});
