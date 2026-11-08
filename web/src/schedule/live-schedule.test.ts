import { describe, expect, it } from "vitest";
import { parseCatalog } from "../catalog/catalog";
import { createLiveSchedule } from "./live-schedule";

/** Channel "rock": a=10s, b=20s, c=30s (cycle = 60s). */
const catalog = parseCatalog({
  schemaVersion: 1,
  channels: [
    { id: "rock", name: "Rock", icon: "", order: 0, videoIds: ["a", "b", "c"] },
    { id: "pop", name: "Pop", icon: "", order: 1, videoIds: ["a", "b", "c"] },
    { id: "solo", name: "Solo", icon: "", order: 2, videoIds: ["s"] },
    { id: "duo", name: "Duo", icon: "", order: 3, videoIds: ["a", "b"] },
    { id: "mixed", name: "Mixed", icon: "", order: 4, videoIds: ["a", "nodur"] },
    { id: "bare", name: "Bare", icon: "", order: 5, videoIds: ["nodur"] },
  ],
  videos: { a: { durationSec: 10 }, b: { durationSec: 20 }, c: { durationSec: 30 }, s: { durationSec: 45 }, nodur: {} },
});
const CYCLE_MS = 60_000;
const T0 = 1_700_000_000_000 - (1_700_000_000_000 % CYCLE_MS); // a cycle boundary

/** Videos of the cycle that starts at `cycleStartMs`, in air order. */
function cycleOrder(schedule: ReturnType<typeof createLiveSchedule>, channelId: string, cycleStartMs: number) {
  const ids: string[] = [];
  let t = cycleStartMs;
  while (t < cycleStartMs + CYCLE_MS) {
    const slot = schedule.whatsOn(channelId, t)!;
    ids.push(slot.videoId);
    t = slot.endsAtMs;
  }
  return ids;
}

describe("live schedule", () => {
  it("returns the same answer for the same channel and instant, on any instance", () => {
    const now = T0 + 12_345;
    expect(createLiveSchedule(catalog).whatsOn("rock", now)).toEqual(createLiveSchedule(catalog).whatsOn("rock", now));
  });

  it("reports the offset into the video, coherent with elapsed time", () => {
    const schedule = createLiveSchedule(catalog);
    const first = schedule.whatsOn("rock", T0)!;
    const later = schedule.whatsOn("rock", T0 + 4_500)!;
    expect(first.offsetSec).toBe(0);
    expect(first.startsAtMs).toBe(T0);
    expect(later.videoId).toBe(first.videoId);
    expect(later.offsetSec).toBe(4.5);
    expect(later.endsAtMs).toBe(first.endsAtMs);
  });

  it("switches to the next video exactly at the boundary", () => {
    const schedule = createLiveSchedule(catalog);
    const first = schedule.whatsOn("rock", T0)!;
    const justBefore = schedule.whatsOn("rock", first.endsAtMs - 1)!;
    const atBoundary = schedule.whatsOn("rock", first.endsAtMs)!;
    expect(justBefore.videoId).toBe(first.videoId);
    expect(atBoundary.videoId).not.toBe(first.videoId);
    expect(atBoundary.offsetSec).toBe(0);
    expect(atBoundary.startsAtMs).toBe(first.endsAtMs);
  });

  it("plays every video once per cycle, with a different order between cycles", () => {
    const schedule = createLiveSchedule(catalog);
    const orders = Array.from({ length: 30 }, (_, k) => cycleOrder(schedule, "rock", T0 + k * CYCLE_MS));
    for (const order of orders) expect([...order].sort()).toEqual(["a", "b", "c"]);
    expect(new Set(orders.map((o) => o.join())).size).toBeGreaterThan(1);
  });

  it("crosses a cycle boundary exactly, never repeating the last video of the previous cycle", () => {
    const schedule = createLiveSchedule(catalog);
    for (let k = 1; k <= 200; k++) {
      const boundary = T0 + k * CYCLE_MS;
      const last = schedule.whatsOn("rock", boundary - 1)!;
      const first = schedule.whatsOn("rock", boundary)!;
      expect(last.endsAtMs).toBe(boundary);
      expect(first.startsAtMs).toBe(boundary);
      expect(first.offsetSec).toBe(0);
      expect(first.videoId).not.toBe(last.videoId);
    }
  });

  it("gives different channels different schedules", () => {
    const schedule = createLiveSchedule(catalog);
    const sequence = (channelId: string) =>
      Array.from({ length: 20 }, (_, k) => cycleOrder(schedule, channelId, T0 + k * CYCLE_MS).join()).join("|");
    expect(sequence("rock")).not.toBe(sequence("pop"));
  });

  it("lists what comes next, chained and across the cycle boundary", () => {
    const schedule = createLiveSchedule(catalog);
    const now = schedule.whatsOn("rock", T0 + CYCLE_MS - 1, 4)!;
    expect(now.upNext).toHaveLength(4);
    let end = now.endsAtMs;
    for (const slot of now.upNext) {
      expect(slot.startsAtMs).toBe(end);
      const onAir = schedule.whatsOn("rock", slot.startsAtMs)!;
      expect(slot).toEqual({ videoId: onAir.videoId, kind: onAir.kind, startsAtMs: onAir.startsAtMs, endsAtMs: onAir.endsAtMs });
      end = slot.endsAtMs;
    }
  });

  it("loops a channel with a single video", () => {
    const schedule = createLiveSchedule(catalog);
    const slot = schedule.whatsOn("solo", 45_000 * 1_000_000 + 7_000)!;
    expect(slot.videoId).toBe("s");
    expect(slot.offsetSec).toBe(7);
    expect(slot.upNext[0]!.videoId).toBe("s");
  });

  it("alternates the two videos of a two-video channel", () => {
    const schedule = createLiveSchedule(catalog);
    const ids: string[] = [];
    let t = T0;
    for (let i = 0; i < 8; i++) {
      const slot = schedule.whatsOn("duo", t)!;
      ids.push(slot.videoId);
      t = slot.endsAtMs;
    }
    expect(ids.every((id, i) => i === 0 || id !== ids[i - 1])).toBe(true);
  });

  it("ignores videos without duration, and has no schedule when none has one", () => {
    const schedule = createLiveSchedule(catalog);
    expect(schedule.scheduledIds("mixed")).toEqual(["a"]);
    expect(schedule.whatsOn("mixed", T0)!.videoId).toBe("a");
    expect(schedule.scheduledIds("bare")).toEqual([]);
    expect(schedule.whatsOn("bare", T0)).toBeUndefined();
    expect(schedule.whatsOn("missing", T0)).toBeUndefined();
  });
});

/**
 * Channel "big": ten 60 s clips k0..k9. Six 20 s commercials m0..m5.
 * With the rule { every: 4, size: 2 } that is 3 breaks of 2 commercials per cycle,
 * so a cycle lasts 600 s + 6 * 20 s = 720 s.
 */
describe("live schedule with commercial breaks", () => {
  const clips = Array.from({ length: 10 }, (_, i) => `k${i}`);
  const spots = Array.from({ length: 6 }, (_, i) => `m${i}`);
  const build = (commercialIds: string[] = spots, channelClips = clips) =>
    parseCatalog({
      schemaVersion: 1,
      channels: [{ id: "big", name: "Big", icon: "", order: 0, videoIds: channelClips }],
      videos: Object.fromEntries(channelClips.map((id) => [id, { durationSec: 60 }])),
      commercials: commercialIds.map((id) => ({ id, brand: "Marca", title: id, year: 1990, durationSec: 20 })),
    });
  const RULE = { every: 4, size: 2 };
  const CYCLE = 720_000;
  const START = 1_700_000_000_000 - (1_700_000_000_000 % CYCLE);

  /** Items of the cycle starting at `startMs`, in air order. */
  function cycleItems(schedule: ReturnType<typeof createLiveSchedule>, cycle: number) {
    const items: { videoId: string; kind: string }[] = [];
    let t = START + cycle * CYCLE;
    while (t < START + (cycle + 1) * CYCLE) {
      const slot = schedule.whatsOn("big", t)!;
      items.push({ videoId: slot.videoId, kind: slot.kind });
      t = slot.endsAtMs;
      expect(t).toBeLessThanOrEqual(START + (cycle + 1) * CYCLE); // the cycle ends exactly on the boundary
    }
    return items;
  }

  it("airs a break after the 4th, 7th and 10th clip of the cycle", () => {
    const items = cycleItems(createLiveSchedule(build(), { breaks: RULE }), 3);

    const kinds = items.map((i) => (i.kind === "clip" ? "C" : "X")).join("");
    expect(kinds).toBe("CCCCXXCCCXXCCCXX");
  });

  it("keeps every cycle exactly 720 s long, so the clock alone says where we are", () => {
    const schedule = createLiveSchedule(build(), { breaks: RULE });
    for (let cycle = 0; cycle < 20; cycle++) {
      expect(schedule.whatsOn("big", START + cycle * CYCLE)!.startsAtMs).toBe(START + cycle * CYCLE);
    }
  });

  it("plays each clip once per cycle and the same commercials every cycle, in a different order", () => {
    const schedule = createLiveSchedule(build(), { breaks: RULE });
    const cycles = Array.from({ length: 25 }, (_, c) => cycleItems(schedule, c));
    for (const items of cycles) {
      expect(items.filter((i) => i.kind === "clip").map((i) => i.videoId).sort()).toEqual(clips);
      expect(items.filter((i) => i.kind === "commercial").map((i) => i.videoId).sort()).toEqual(spots);
    }
    const orders = new Set(cycles.map((items) => items.filter((i) => i.kind === "commercial").map((i) => i.videoId).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("answers identically on any instance, inside a break too", () => {
    const inBreak = START + 4 * 60_000 + 25_000; // 5 s into the second commercial
    const a = createLiveSchedule(build(), { breaks: RULE }).whatsOn("big", inBreak)!;
    const b = createLiveSchedule(build(), { breaks: RULE }).whatsOn("big", inBreak)!;

    expect(a).toEqual(b);
    expect(a.kind).toBe("commercial");
    expect(a.offsetSec).toBe(5);
  });

  it("never repeats a commercial within the same break, even with fewer commercials than slots", () => {
    const schedule = createLiveSchedule(build(["m0", "m1", "m2"]), { breaks: RULE });
    for (let cycle = 0; cycle < 40; cycle++) {
      const items = cycleItems(schedule, cycle);
      const breaks = items.map((i) => (i.kind === "commercial" ? i.videoId : "|")).join(",").split("|").map((b) => b.split(",").filter(Boolean));
      for (const group of breaks.filter((g) => g.length > 0)) expect(new Set(group).size).toBe(group.length);
    }
  });

  it("repeats the only commercial when a break has more slots than commercials", () => {
    const schedule = createLiveSchedule(build(["m0"]), { breaks: RULE });

    const commercials = cycleItems(schedule, 2).filter((i) => i.kind === "commercial");

    expect(commercials.map((i) => i.videoId)).toEqual(Array(6).fill("m0"));
  });

  it("lists the commercials of the break in what comes next", () => {
    const schedule = createLiveSchedule(build(), { breaks: RULE });
    const onAir = schedule.whatsOn("big", START + 3 * 60_000, 3)!; // 4th clip is on air

    expect(onAir.upNext.map((s) => s.kind)).toEqual(["commercial", "commercial", "clip"]);
  });

  it("keeps commercials out of the channel's clip list and counts them per cycle", () => {
    const schedule = createLiveSchedule(build(), { breaks: RULE });

    expect(schedule.scheduledIds("big")).toEqual(clips);
    expect(schedule.itemsPerCycle("big")).toBe(16);
  });

  it("is exactly the old grid when the catalog has no commercials", () => {
    const without = parseCatalog({
      schemaVersion: 1,
      channels: [{ id: "big", name: "Big", icon: "", order: 0, videoIds: clips }],
      videos: Object.fromEntries(clips.map((id) => [id, { durationSec: 60 }])),
    });
    const plain = createLiveSchedule(without, { breaks: RULE });
    const reference = createLiveSchedule(without);

    for (let t = START; t < START + 2 * 600_000; t += 17_000) {
      expect(plain.whatsOn("big", t)).toEqual(reference.whatsOn("big", t));
      expect(plain.whatsOn("big", t)!.kind).toBe("clip");
    }
  });

  it("plays a break by default when the catalog has commercials", () => {
    const schedule = createLiveSchedule(build());

    const kinds = new Set<string>();
    for (let t = START; t < START + 720_000; t += 10_000) kinds.add(schedule.whatsOn("big", t)!.kind);
    expect(kinds).toEqual(new Set(["clip", "commercial"]));
  });
});
