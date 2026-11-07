import type { Catalog } from "../catalog/catalog";
import type { ChannelSnapshot } from "../catalog/schema";
import type { Clock } from "../lib/clock";
import type { Random } from "../lib/random";
import type { PlayerAdapter } from "../player/player";

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

/**
 * Decides what plays: which video of which channel, from which second.
 * Minimal version: plays the channel's playlist in order, looping forever.
 */
export interface Tuner {
  /** Switches to a channel and plays it from its first video. Throws for unknown ids. */
  tune(channelId: string): void;
  /** The current video ended: play the next one. */
  onEnded(): void;
  /** `videoId` failed to play: if it is the current one, move on to the next. */
  onError(videoId: string): void;
  current(): NowPlaying | undefined;
}

export function createTuner({ catalog, player }: TunerDeps): Tuner {
  let channel: ChannelSnapshot | undefined;
  let index = 0;

  const currentVideoId = () => channel?.videoIds[index];

  const play = () => {
    const videoId = currentVideoId();
    if (videoId) player.load(videoId, 0);
  };

  const advance = () => {
    if (!channel) return;
    index = (index + 1) % channel.videoIds.length;
    play();
  };

  const tuner: Tuner = {
    tune(channelId) {
      const next = catalog.channel(channelId);
      if (!next) throw new Error(`Canal "${channelId}" não existe no catálogo`);
      channel = next;
      index = 0;
      play();
    },
    onEnded: advance,
    onError(videoId) {
      if (videoId === currentVideoId()) advance();
    },
    current() {
      const videoId = currentVideoId();
      return channel && videoId ? { channelId: channel.id, videoId } : undefined;
    },
  };

  player.onEnded(() => tuner.onEnded());
  player.onError((videoId) => tuner.onError(videoId));
  return tuner;
}
