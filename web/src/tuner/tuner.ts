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

/**
 * Decides what plays: which video of which channel. Each channel plays a
 * shuffled queue that is remembered for the session, so coming back to a
 * channel continues where its queue left off.
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
  /** `videoId` failed to play: if it is the current one, move on to the next. */
  onError(videoId: string): void;
  current(): NowPlaying | undefined;
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
  const started = createEmitter<[nowPlaying: NowPlaying]>();

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

  const load = (next: ChannelSnapshot, nextVideoId: string) => {
    channel = next;
    videoId = nextVideoId;
    player.load(nextVideoId, 0);
    started.emit({ channelId: next.id, videoId: nextVideoId });
  };

  const settle = () => {
    const target = pending;
    cancelPending();
    if (!target) return;
    const next = lookup(target.channelId);
    load(next, target.videoId ?? queueOf(next).next());
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
    if (!channel) return;
    load(channel, queueOf(channel).next());
  };

  const tuner: Tuner = {
    tune(channelId) {
      const next = lookup(channelId);
      cancelPending();
      load(next, queueOf(next).next());
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
      if (!pending && failedVideoId === videoId) advance();
    },
    onNowPlaying: (listener) => started.on(listener),
    current() {
      return channel && videoId ? { channelId: channel.id, videoId } : undefined;
    },
  };

  player.onEnded(() => tuner.onEnded());
  player.onError((failed) => tuner.onError(failed));
  return tuner;
}
