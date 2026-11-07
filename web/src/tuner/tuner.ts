import type { Catalog } from "../catalog/catalog";
import type { ChannelSnapshot } from "../catalog/schema";
import type { Clock } from "../lib/clock";
import type { Random } from "../lib/random";
import { createEmitter, type PlayerAdapter, type Unsubscribe } from "../player/player";

export interface TunerDeps {
  catalog: Catalog;
  player: PlayerAdapter;
  /** Not used yet; zapping debounce (#5) and the live schedule (#11) need it. */
  clock: Clock;
  /** Not used yet; queue mode shuffling (#5) needs it. */
  random: Random;
}

export interface NowPlaying {
  channelId: string;
  videoId: string;
}

/** `unavailable`: every video of the tuned channel failed this session, so nothing plays. */
export type TunerStatus = "playing" | "unavailable";

/**
 * Decides what plays: which video of which channel, from which second.
 * Minimal version: plays the channel's playlist in order, looping forever,
 * skipping videos that failed earlier in the session.
 */
export interface Tuner {
  /** Switches to a channel and plays it from its first playable video. Throws for unknown ids. */
  tune(channelId: string): void;
  /** The current video ended: play the next one. */
  onEnded(): void;
  /** `videoId` failed to play: if it is the current one, never try it again and move on. */
  onError(videoId: string): void;
  current(): NowPlaying | undefined;
  /**
   * Connection state. Offline, errors are ignored (no network is not the
   * video's fault); back online, the current video reloads from the start.
   */
  setOnline(online: boolean): void;
  /** Called when the status changes. */
  onStatus(listener: (status: TunerStatus) => void): Unsubscribe;
}

export function createTuner({ catalog, player }: TunerDeps): Tuner {
  let channel: ChannelSnapshot | undefined;
  /** Position of the current video in the channel; `undefined` when the channel is unavailable. */
  let index: number | undefined;
  let status: TunerStatus | undefined;
  let online = true;
  /** Videos that failed to play this session; never tried again, on any channel. */
  const bad = new Set<string>();
  const statusChanged = createEmitter<[status: TunerStatus]>();

  const currentVideoId = () => (index === undefined ? undefined : channel?.videoIds[index]);

  const setStatus = (next: TunerStatus) => {
    if (next === status) return;
    status = next;
    statusChanged.emit(next);
  };

  /** Plays the first playable video at or after `from`, wrapping around the playlist. */
  const playFrom = (from: number) => {
    if (!channel) return;
    const { videoIds } = channel;
    index = undefined;
    for (let step = 0; step < videoIds.length; step++) {
      const next = (from + step) % videoIds.length;
      if (!bad.has(videoIds[next]!)) {
        index = next;
        break;
      }
    }
    const videoId = currentVideoId();
    if (videoId) player.load(videoId, 0);
    setStatus(videoId ? "playing" : "unavailable");
  };

  const advance = () => {
    if (index !== undefined) playFrom(index + 1);
  };

  const tuner: Tuner = {
    tune(channelId) {
      const next = catalog.channel(channelId);
      if (!next) throw new Error(`Canal "${channelId}" não existe no catálogo`);
      channel = next;
      playFrom(0);
    },
    onEnded: advance,
    onError(videoId) {
      if (!online || videoId !== currentVideoId()) return;
      bad.add(videoId);
      advance();
    },
    current() {
      const videoId = currentVideoId();
      return channel && videoId ? { channelId: channel.id, videoId } : undefined;
    },
    setOnline(next) {
      const reconnected = next && !online;
      online = next;
      const videoId = currentVideoId();
      if (reconnected && videoId) player.load(videoId, 0);
    },
    onStatus: statusChanged.on,
  };

  player.onEnded(() => tuner.onEnded());
  player.onError((videoId) => tuner.onError(videoId));
  return tuner;
}
