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
      expect(slot).toEqual({ videoId: onAir.videoId, startsAtMs: onAir.startsAtMs, endsAtMs: onAir.endsAtMs });
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
