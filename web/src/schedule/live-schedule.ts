import type { Catalog } from "../catalog/catalog";
import { hashString, seededShuffle } from "../lib/shuffle";

/** A video on air during `[startsAtMs, endsAtMs)`. */
export interface LiveSlot {
  videoId: string;
  startsAtMs: number;
  endsAtMs: number;
}

export interface OnAir extends LiveSlot {
  /** Seconds into the video at the asked instant (may be fractional). */
  offsetSec: number;
  /** The slots that follow, in air order. */
  upNext: LiveSlot[];
}

/**
 * Deterministic TV grid: what is on air in a channel at a given instant
 * depends only on the catalog, the channel id and the time, so every device
 * shows the same clip at the same point. Time (from the Unix epoch) is split
 * into cycles as long as the sum of the channel's durations; each cycle plays
 * every video once, in an order shuffled by a seed from (channel, cycle).
 */
export interface LiveSchedule {
  /** `undefined` when the channel is unknown or has no video with a duration. */
  whatsOn(channelId: string, nowMs: number, upNextCount?: number): OnAir | undefined;
  /** Distinct videos of the channel that take part in the grid, in playlist order. */
  scheduledIds(channelId: string): readonly string[];
}

const DEFAULT_UP_NEXT = 5;

interface ChannelGrid {
  id: string;
  ids: string[];
  durationMs: Map<string, number>;
  cycleMs: number;
  /** Order of the most recently asked cycle. */
  cached?: { cycle: number; order: string[] };
}

export function createLiveSchedule(catalog: Catalog): LiveSchedule {
  const grids = new Map<string, ChannelGrid | undefined>();

  const gridOf = (channelId: string): ChannelGrid | undefined => {
    if (grids.has(channelId)) return grids.get(channelId);
    const channel = catalog.channel(channelId);
    let grid: ChannelGrid | undefined;
    if (channel) {
      const durationMs = new Map<string, number>();
      for (const id of channel.videoIds) {
        const sec = catalog.video(id)?.durationSec;
        const ms = typeof sec === "number" && Number.isFinite(sec) ? Math.round(sec) * 1000 : 0;
        if (ms > 0 && !durationMs.has(id)) durationMs.set(id, ms);
      }
      const ids = [...durationMs.keys()];
      const cycleMs = [...durationMs.values()].reduce((sum, ms) => sum + ms, 0);
      if (ids.length > 0) grid = { id: channelId, ids, durationMs, cycleMs };
    }
    grids.set(channelId, grid);
    return grid;
  };

  const rawOrder = (grid: ChannelGrid, cycle: number) =>
    seededShuffle(grid.ids, hashString(`${grid.id}#${cycle}`));

  const orderOf = (grid: ChannelGrid, cycle: number): string[] => {
    if (grid.cached?.cycle === cycle) return grid.cached.order;
    let order: string[];
    if (grid.ids.length <= 2) {
      // One video loops; two alternate, which never repeats across cycles.
      order = rawOrder(grid, 0);
    } else {
      order = rawOrder(grid, cycle);
      // Never start a cycle with the video that closed the previous one.
      // The swap leaves the last position alone, so no cycle depends on an earlier one.
      const previous = cycle > 0 ? rawOrder(grid, cycle - 1) : undefined;
      if (previous && order[0] === previous[previous.length - 1]) {
        [order[0], order[1]] = [order[1]!, order[0]!];
      }
    }
    grid.cached = { cycle, order };
    return order;
  };

  const slotAt = (grid: ChannelGrid, nowMs: number): LiveSlot => {
    const cycle = Math.floor(nowMs / grid.cycleMs);
    const cycleStart = cycle * grid.cycleMs;
    let start = cycleStart;
    for (const videoId of orderOf(grid, cycle)) {
      const end = start + grid.durationMs.get(videoId)!;
      if (nowMs < end) return { videoId, startsAtMs: start, endsAtMs: end };
      start = end;
    }
    throw new Error("unreachable: the cycle covers every instant");
  };

  return {
    scheduledIds: (channelId) => gridOf(channelId)?.ids ?? [],
    whatsOn(channelId, nowMs, upNextCount = DEFAULT_UP_NEXT) {
      const grid = gridOf(channelId);
      if (!grid) return undefined;
      const current = slotAt(grid, nowMs);
      const upNext: LiveSlot[] = [];
      let end = current.endsAtMs;
      for (let i = 0; i < upNextCount; i++) {
        const slot = slotAt(grid, end);
        upNext.push(slot);
        end = slot.endsAtMs;
      }
      return { ...current, offsetSec: (nowMs - current.startsAtMs) / 1000, upNext };
    },
  };
}
