import type { Catalog } from "../catalog/catalog";
import { hashString, seededShuffle } from "../lib/shuffle";
import { DEFAULT_BREAK_RULE, type BreakRule } from "./breaks";

/** A video on air during `[startsAtMs, endsAtMs)`. */
export interface LiveSlot {
  videoId: string;
  /** A clip of the channel, or a commercial of a break between clips. */
  kind: "clip" | "commercial";
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
 *
 * Breaks: when the catalog has commercials, each cycle also airs a few breaks
 * between clips (see `BreakRule`). A channel takes a fixed set of commercials
 * (by channel), so the cycle keeps the same length and "now" is still one
 * division away; only the order of the commercials changes from cycle to cycle.
 */
export interface LiveSchedule {
  /** `undefined` when the channel is unknown or has no video with a duration. */
  whatsOn(channelId: string, nowMs: number, upNextCount?: number): OnAir | undefined;
  /** Distinct videos of the channel that take part in the grid, in playlist order. */
  scheduledIds(channelId: string): readonly string[];
  /** Clips plus commercials of one cycle of the channel (0 when it has no grid). */
  itemsPerCycle(channelId: string): number;
}

export interface LiveScheduleOptions {
  breaks?: BreakRule;
}

const DEFAULT_UP_NEXT = 5;

interface Item {
  videoId: string;
  kind: LiveSlot["kind"];
  ms: number;
}

interface ChannelGrid {
  id: string;
  ids: string[];
  durationMs: Map<string, number>;
  /** The commercials this channel airs per cycle, one entry per slot (may repeat when slots outnumber commercials). */
  spots: string[];
  /** After how many clips each break airs. */
  breakAfter: number[];
  size: number;
  cycleMs: number;
  /** Clip order of the most recently asked cycle. */
  cached?: { cycle: number; order: string[] };
  /** Items (clips and commercials) of the most recently asked cycle. */
  items?: { cycle: number; list: Item[] };
}

export function createLiveSchedule(catalog: Catalog, { breaks = DEFAULT_BREAK_RULE }: LiveScheduleOptions = {}): LiveSchedule {
  const spotMs = new Map(catalog.commercials().map((c) => [c.id, Math.round(c.durationSec) * 1000]));
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
      const clipsMs = [...durationMs.values()].reduce((sum, ms) => sum + ms, 0);
      const { spots, breakAfter } = planBreaks(channelId, ids.length, [...spotMs.keys()], breaks);
      const cycleMs = spots.reduce((sum, id) => sum + spotMs.get(id)!, clipsMs);
      if (ids.length > 0) grid = { id: channelId, ids, durationMs, spots, breakAfter, size: breaks.size, cycleMs };
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

  /** Clips of the cycle with its breaks in between. */
  const itemsOf = (grid: ChannelGrid, cycle: number): Item[] => {
    if (grid.items?.cycle === cycle) return grid.items.list;
    const spots = grid.spots.length
      ? separateBreaks(seededShuffle(grid.spots, hashString(`${grid.id}#${cycle}#comerciais`)), grid.size)
      : [];
    const list: Item[] = [];
    let nextBreak = 0;
    orderOf(grid, cycle).forEach((videoId, i) => {
      list.push({ videoId, kind: "clip", ms: grid.durationMs.get(videoId)! });
      if (i + 1 === grid.breakAfter[nextBreak]) {
        for (const id of spots.slice(nextBreak * grid.size, (nextBreak + 1) * grid.size)) {
          list.push({ videoId: id, kind: "commercial", ms: spotMs.get(id)! });
        }
        nextBreak++;
      }
    });
    grid.items = { cycle, list };
    return list;
  };

  const slotAt = (grid: ChannelGrid, nowMs: number): LiveSlot => {
    const cycle = Math.floor(nowMs / grid.cycleMs);
    const cycleStart = cycle * grid.cycleMs;
    let start = cycleStart;
    for (const { videoId, kind, ms } of itemsOf(grid, cycle)) {
      const end = start + ms;
      if (nowMs < end) return { videoId, kind, startsAtMs: start, endsAtMs: end };
      start = end;
    }
    throw new Error("unreachable: the cycle covers every instant");
  };

  return {
    scheduledIds: (channelId) => gridOf(channelId)?.ids ?? [],
    itemsPerCycle(channelId) {
      const grid = gridOf(channelId);
      return grid ? grid.ids.length + grid.spots.length : 0;
    },
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

/**
 * Where the breaks of a cycle go and which commercials fill them, from the
 * channel alone: about one break per `every` clips, spread evenly, the last one
 * closing the cycle. The same channel always gets the same commercials.
 */
function planBreaks(channelId: string, clips: number, pool: readonly string[], rule: BreakRule) {
  if (pool.length === 0 || clips === 0 || rule.size < 1 || rule.every < 1) return { spots: [], breakAfter: [] };
  const breaks = Math.max(1, Math.round(clips / rule.every));
  const breakAfter = Array.from({ length: breaks }, (_, b) => Math.ceil(((b + 1) * clips) / breaks));
  const spots: string[] = [];
  // Slots beyond the pool size go around again, with a new shuffle each lap.
  for (let lap = 0; spots.length < breaks * rule.size; lap++) {
    spots.push(...seededShuffle(pool, hashString(`${channelId}#comerciais#${lap}`)));
  }
  return { spots: spots.slice(0, breaks * rule.size), breakAfter };
}

/**
 * Swaps entries between breaks so that no commercial airs twice in the same
 * break (possible only while there are at least `size` different ones).
 * Deterministic: the first fitting entry outside the break is used.
 */
function separateBreaks(spots: string[], size: number): string[] {
  const list = [...spots];
  if (new Set(list).size < size) return list;
  for (let start = 0; start < list.length; start += size) {
    for (let j = start + 1; j < Math.min(start + size, list.length); j++) {
      if (!list.slice(start, j).includes(list[j]!)) continue;
      const fits = (k: number) => {
        if (k >= start && k < start + size) return false;
        const from = k - (k % size);
        const others = list.slice(from, from + size).filter((_, i) => from + i !== k);
        return !list.slice(start, j).includes(list[k]!) && !others.includes(list[j]!);
      };
      const k = list.findIndex((_, i) => fits(i));
      if (k !== -1) [list[j], list[k]] = [list[k]!, list[j]!];
    }
  }
  return list;
}
