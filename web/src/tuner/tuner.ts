import type { Catalog } from "../catalog/catalog";
import type { ChannelSnapshot } from "../catalog/schema";
import type { Clock, TimerId } from "../lib/clock";
import type { Random } from "../lib/random";
import { createEmitter, type PlayerAdapter, type Unsubscribe } from "../player/player";
import { createQueue, type Queue } from "../queue/queue";

/** How long zapping must stay quiet before the video of the landing channel loads. */
export const ZAP_DEBOUNCE_MS = 400;

export interface TunerDeps {
  catalog: Catalog;
  player: PlayerAdapter;
  clock: Clock;
  /** Seeds the shuffled queue of each channel (once per session). */
  random: Random;
}

export interface NowPlaying {
  channelId: string;
  videoId: string;
}

/** `unavailable`: every video of the tuned channel failed this session, so nothing plays. */
export type TunerStatus = "playing" | "unavailable";

/**
 * Decides what plays: which video of which channel. Each channel plays a
 * shuffled queue that is remembered for the session, so coming back to a
 * channel continues where its queue left off. Videos that failed are never
 * tried again in the session, on any channel.
 */
export interface Tuner {
  /** Switches to a channel right away. Throws for unknown ids. */
  tune(channelId: string): void;
  /** Next channel in the list (wraps around). Loads once the zapping settles. */
  channelUp(): void;
  /** Previous channel in the list (wraps around). Loads once the zapping settles. */
  channelDown(): void;
  /** Skips the current clip. Loads once the zapping/skipping settles. */
  skip(): void;
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

export function createTuner({ catalog, player, clock, random }: TunerDeps): Tuner {
  const queues = new Map<string, Queue>();
  let channel: ChannelSnapshot | undefined;
  let videoId: string | undefined;
  let pending: Pending | undefined;
  let timer: TimerId | undefined;
  let status: TunerStatus | undefined;
  let online = true;
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

  const load = (next: ChannelSnapshot, nextVideoId: string | undefined) => {
    channel = next;
    videoId = nextVideoId;
    if (!nextVideoId) return setStatus("unavailable");
    player.load(nextVideoId, 0);
    setStatus("playing");
    started.emit({ channelId: next.id, videoId: nextVideoId });
  };

  const settle = () => {
    const target = pending;
    cancelPending();
    if (!target) return;
    const next = lookup(target.channelId);
    load(next, nextPlayable(next, target.videoId));
  };

  const schedule = (next: Pending) => {
    if (timer !== undefined) clock.clearTimeout(timer);
    pending = next;
    timer = clock.setTimeout(settle, ZAP_DEBOUNCE_MS);
  };

  const zap = (step: 1 | -1) => {
    if (!channel) return;
    const channels = catalog.channels();
    const from = channels.findIndex((c) => c.id === (pending?.channelId ?? channel!.id));
    const target = channels[(from + step + channels.length) % channels.length]!;
    if (target.id === channel.id) cancelPending();
    else schedule({ channelId: target.id });
  };

  const advance = () => {
    if (channel && videoId) load(channel, nextPlayable(channel));
  };

  const tuner: Tuner = {
    tune(channelId) {
      const next = lookup(channelId);
      cancelPending();
      load(next, nextPlayable(next));
    },
    channelUp: () => zap(1),
    channelDown: () => zap(-1),
    skip() {
      if (!channel) return;
      const target = lookup(pending?.channelId ?? channel.id);
      const queue = queueOf(target);
      // Clip that would play if the burst settled now: already drawn, or still to draw.
      if (target.id !== channel.id && pending?.videoId === undefined) queue.next();
      schedule({ channelId: target.id, videoId: queue.next() });
    },
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
      if (reconnected && videoId) player.load(videoId, 0);
    },
    onStatus: (listener) => statusChanged.on(listener),
  };

  player.onEnded(() => tuner.onEnded());
  player.onError((failed) => tuner.onError(failed));
  return tuner;
}
