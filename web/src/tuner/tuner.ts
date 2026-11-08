import type { Catalog } from "../catalog/catalog";
import type { ChannelSnapshot } from "../catalog/schema";
import type { Clock, TimerId } from "../lib/clock";
import type { Random } from "../lib/random";
import { createEmitter, type PlayerAdapter, type Unsubscribe } from "../player/player";
import type { PlaybackMode } from "../preferences/preferences";
import { createQueue, type Queue } from "../queue/queue";
import { createLiveSchedule, type LiveSchedule, type LiveSlot } from "../schedule/live-schedule";

/** How long zapping must stay quiet before the video of the landing channel loads. */
export const ZAP_DEBOUNCE_MS = 400;

export interface TunerDeps {
  catalog: Catalog;
  player: PlayerAdapter;
  clock: Clock;
  /** Seeds the shuffled queue of each channel (once per session). */
  random: Random;
  /** The live grid. Defaults to one built from the catalog. */
  schedule?: LiveSchedule;
  /** Starting mode. Defaults to live. */
  mode?: PlaybackMode;
}

export interface NowPlaying {
  channelId: string;
  videoId: string;
}

/** `unavailable`: every video of the tuned channel failed this session, so nothing plays. */
export type TunerStatus = "playing" | "unavailable";

/**
 * Decides what plays: which video of which channel, and from which second.
 * In live mode a channel follows the clock-driven grid (see `LiveSchedule`);
 * in queue mode, or for a channel whose videos have no duration, it plays a
 * shuffled queue that is remembered for the session, so coming back to a
 * channel continues where its queue left off. Videos that failed are never
 * tried again in the session, on any channel; in live mode the grid itself is
 * left alone and the next item of the grid plays instead.
 */
export interface Tuner {
  /** Switches to a channel right away. Throws for unknown ids. */
  tune(channelId: string): void;
  /** Next channel in the list (wraps around). Loads once the zapping settles. */
  channelUp(): void;
  /** Previous channel in the list (wraps around). Loads once the zapping settles. */
  channelDown(): void;
  /**
   * Restricts zapping (not `tune`) to these channels. `undefined` or an empty
   * set means no restriction. Works even if the current channel is not in it.
   */
  setZapFilter(channelIds: ReadonlySet<string> | undefined): void;
  /** Skips the current clip (queue mode; ignored in live mode). Loads once the zapping/skipping settles. */
  skip(): void;
  /** Switches between live and queue mode; the current channel is retuned right away. */
  setMode(mode: PlaybackMode): void;
  /** Mode in effect for the current channel: queue when the channel has no grid. */
  mode(): PlaybackMode;
  /** The current video ended: play the next one. */
  onEnded(): void;
  /** `videoId` failed to play: if it is the current one, never try it again and move on. */
  onError(videoId: string): void;
  /** `undefined` before tuning and while the channel is unavailable. */
  current(): NowPlaying | undefined;
  /**
   * Connection state. Offline, errors are ignored (no network is not the
   * video's fault); back online, the current video reloads from the start.
   */
  setOnline(online: boolean): void;
  /** Called when the status changes. */
  onStatus(listener: (status: TunerStatus) => void): Unsubscribe;
  /**
   * Called each time a clip starts: on tuning, when the next one begins and
   * when zapping or skipping settles (never on each intermediate step).
   */
  onNowPlaying(listener: (nowPlaying: NowPlaying) => void): Unsubscribe;
}

/** A zapping/skip burst waiting for the debounce; the player keeps its video meanwhile. */
interface Pending {
  channelId: string;
  /** Set once a skip drew a clip; otherwise the landing clip is drawn when it settles. */
  videoId?: string;
}

export function createTuner({
  catalog,
  player,
  clock,
  random,
  schedule: grid = createLiveSchedule(catalog),
  mode: initialMode = "live",
}: TunerDeps): Tuner {
  let chosenMode = initialMode;
  /** Grid slot being played; set only while the channel plays live. */
  let slot: LiveSlot | undefined;
  const queues = new Map<string, Queue>();
  let channel: ChannelSnapshot | undefined;
  let videoId: string | undefined;
  let pending: Pending | undefined;
  let timer: TimerId | undefined;
  let status: TunerStatus | undefined;
  let online = true;
  let zapFilter: ReadonlySet<string> | undefined;
  /** Videos that failed to play this session; never tried again, on any channel. */
  const bad = new Set<string>();
  const started = createEmitter<[nowPlaying: NowPlaying]>();
  const statusChanged = createEmitter<[status: TunerStatus]>();

  const setStatus = (next: TunerStatus) => {
    if (next === status) return;
    status = next;
    statusChanged.emit(next);
  };

  const queueOf = (target: ChannelSnapshot): Queue => {
    let queue = queues.get(target.id);
    if (!queue) {
      queue = createQueue(target.videoIds, Math.floor(random() * 2 ** 32));
      queues.set(target.id, queue);
    }
    return queue;
  };

  const lookup = (channelId: string): ChannelSnapshot => {
    const found = catalog.channel(channelId);
    if (!found) throw new Error(`Canal "${channelId}" não existe no catálogo`);
    return found;
  };

  const cancelPending = () => {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };

  /**
   * Next video of the channel's queue that has not failed, or `undefined` when
   * all of them have. `drawn` is a clip already taken from the queue (by a skip).
   */
  const nextPlayable = (target: ChannelSnapshot, drawn?: string): string | undefined => {
    if (target.videoIds.every((id) => bad.has(id))) return undefined;
    const queue = queueOf(target);
    let next = drawn ?? queue.next();
    // Ends: at least one video of the channel is still playable.
    while (bad.has(next)) next = queue.next();
    return next;
  };

  const isLive = (target: ChannelSnapshot) =>
    chosenMode === "live" && grid.scheduledIds(target.id).length > 0;

  const load = (next: ChannelSnapshot, nextVideoId: string | undefined, startSec = 0, nextSlot?: LiveSlot) => {
    channel = next;
    videoId = nextVideoId;
    slot = nextSlot;
    if (!nextVideoId) return setStatus("unavailable");
    player.load(nextVideoId, startSec);
    setStatus("playing");
    started.emit({ channelId: next.id, videoId: nextVideoId });
  };

  /**
   * Plays what is on air at `atMs` or, if that video failed, the first item of
   * the grid after it that did not. Falls back to the queue when every video of
   * the grid failed.
   */
  const playLive = (target: ChannelSnapshot, atMs: number) => {
    const ids = grid.scheduledIds(target.id);
    let at = atMs;
    let onAir = grid.whatsOn(target.id, at, 0)!;
    // Two cycles contain every video of the grid, so this finds a playable one if any is.
    for (let i = 0; i < 2 * ids.length && bad.has(onAir.videoId); i++) {
      at = onAir.endsAtMs;
      onAir = grid.whatsOn(target.id, at, 0)!;
    }
    if (bad.has(onAir.videoId)) return load(target, nextPlayable(target));
    load(target, onAir.videoId, onAir.offsetSec, onAir);
  };

  /** Loads what plays next on `target` right now, following the grid or the queue. */
  const playNow = (target: ChannelSnapshot, drawn?: string) => {
    if (isLive(target)) playLive(target, clock.now());
    else load(target, nextPlayable(target, drawn));
  };

  const settle = () => {
    const target = pending;
    cancelPending();
    if (!target) return;
    playNow(lookup(target.channelId), target.videoId);
  };

  const schedule = (next: Pending) => {
    if (timer !== undefined) clock.clearTimeout(timer);
    pending = next;
    timer = clock.setTimeout(settle, ZAP_DEBOUNCE_MS);
  };

  const pendingTarget = () => lookup(pending?.channelId ?? channel!.id);

  const zap = (step: 1 | -1) => {
    if (!channel) return;
    const channels = catalog.channels();
    const from = channels.findIndex((c) => c.id === (pending?.channelId ?? channel!.id));
    const allowed = (c: ChannelSnapshot) => !zapFilter?.size || zapFilter.has(c.id);
    let at = from;
    // Ends: at worst it comes back to the channel we started from.
    do {
      at = (at + step + channels.length) % channels.length;
    } while (!allowed(channels[at]!) && at !== from);
    const target = channels[at]!;
    if (target.id === channel.id) cancelPending();
    else schedule({ channelId: target.id });
  };

  const advance = () => {
    if (!channel || !videoId) return;
    // Never earlier than the end of the clip that was playing: the next one starts from its beginning.
    if (slot && isLive(channel)) playLive(channel, Math.max(clock.now(), slot.endsAtMs));
    else load(channel, nextPlayable(channel));
  };

  const tuner: Tuner = {
    tune(channelId) {
      const next = lookup(channelId);
      cancelPending();
      playNow(next);
    },
    setZapFilter(channelIds) {
      zapFilter = channelIds;
    },
    channelUp: () => zap(1),
    channelDown: () => zap(-1),
    skip() {
      if (!channel || isLive(pendingTarget())) return;
      const target = lookup(pending?.channelId ?? channel.id);
      const queue = queueOf(target);
      // Clip that would play if the burst settled now: already drawn, or still to draw.
      if (target.id !== channel.id && pending?.videoId === undefined) queue.next();
      schedule({ channelId: target.id, videoId: queue.next() });
    },
    setMode(next) {
      if (next === chosenMode) return;
      chosenMode = next;
      if (!channel) return;
      const current = channel;
      cancelPending();
      playNow(current);
    },
    mode: () => (channel ? (isLive(channel) ? "live" : "queue") : chosenMode),
    onEnded() {
      if (!pending) advance();
    },
    onError(failedVideoId) {
      if (!online || pending || failedVideoId !== videoId) return;
      bad.add(failedVideoId);
      advance();
    },
    onNowPlaying: (listener) => started.on(listener),
    current() {
      return channel && videoId ? { channelId: channel.id, videoId } : undefined;
    },
    setOnline(next) {
      const reconnected = next && !online;
      online = next;
      if (!reconnected || !videoId || !channel) return;
      if (slot && isLive(channel)) playLive(channel, clock.now());
      else player.load(videoId, 0);
    },
    onStatus: (listener) => statusChanged.on(listener),
  };

  player.onEnded(() => tuner.onEnded());
  player.onError((failed) => tuner.onError(failed));
  return tuner;
}
