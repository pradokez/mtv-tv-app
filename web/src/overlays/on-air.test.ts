import { describe, expect, it } from "vitest";
import { parseCatalog } from "../catalog/catalog";
import type { Clock } from "../lib/clock";
import { FakePlayer } from "../player/fake-player";
import { createLiveSchedule } from "../schedule/live-schedule";
import { createTuner } from "../tuner/tuner";
import { clipLabel, guideOnAir } from "./on-air";

const catalog = parseCatalog({
  schemaVersion: 1,
  channels: [
    { id: "solo", name: "Solo", icon: "", order: 0, videoIds: ["s"] },
    { id: "duo", name: "Duo", icon: "", order: 1, videoIds: ["x", "y"] },
    { id: "bare", name: "Bare", icon: "", order: 2, videoIds: ["nodur"] },
    { id: "anon", name: "Anon", icon: "", order: 3, videoIds: ["u", "v"] },
  ],
  videos: {
    s: { durationSec: 100, artist: "Nirvana", song: "Lithium" },
    x: { durationSec: 10, title: "Titulo X" },
    y: { durationSec: 20, artist: "Artist Y", song: "Song Y" },
    nodur: {},
    u: { durationSec: 30 },
    v: { durationSec: 40 },
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

  it("still knows the clip and its end when the catalog has no labels for it", () => {
    const info = guideOnAir(catalog, schedule, "anon", 1_700_000_000_000)!;

    expect(info.now).toBeUndefined();
    expect(info.next).toBeUndefined();
    expect(["u", "v"]).toContain(info.videoId);
    expect(info.endsAtMs).toBeGreaterThan(1_700_000_000_000);
  });

  it("names the clip the tuner plays when the channel is tuned at that instant", () => {
    const now = 1_700_000_012_345;
    const clock: Clock = { now: () => now, setTimeout: () => 0 as never, clearTimeout: () => {} };
    const player = new FakePlayer();
    const tuner = createTuner({ catalog, player, schedule, clock, random: () => 0.5, mode: "live" });
    const info = guideOnAir(catalog, schedule, "duo", now)!;

    tuner.tune("duo");

    expect(player.current).toEqual({ videoId: info.videoId, startSec: schedule.whatsOn("duo", now)!.offsetSec });
  });
});
