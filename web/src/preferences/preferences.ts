/** The slice of `Storage` the app uses, so tests can pass an in-memory one. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/** `live`: grid driven by the clock; `queue`: shuffled queue the viewer can skip through. */
export type PlaybackMode = "live" | "queue";

export interface Preferences {
  /** Channel watched last, if any. */
  lastChannel(): string | undefined;
  setLastChannel(channelId: string): void;
  /** Playback mode; live unless the viewer chose the queue. */
  mode(): PlaybackMode;
  setMode(mode: PlaybackMode): void;
}

const LAST_CHANNEL_KEY = "mtv-tv.lastChannel";
const MODE_KEY = "mtv-tv.mode";

/** Persists user preferences. A broken or unavailable storage is ignored: the app just forgets. */
export function createPreferences(storage: KeyValueStorage): Preferences {
  return {
    lastChannel() {
      try {
        return storage.getItem(LAST_CHANNEL_KEY) ?? undefined;
      } catch {
        return undefined;
      }
    },
    setLastChannel(channelId) {
      try {
        storage.setItem(LAST_CHANNEL_KEY, channelId);
      } catch {
        // Storage full or blocked: losing the last channel is harmless.
      }
    },
    mode() {
      try {
        return storage.getItem(MODE_KEY) === "queue" ? "queue" : "live";
      } catch {
        return "live";
      }
    },
    setMode(mode) {
      try {
        storage.setItem(MODE_KEY, mode);
      } catch {
        // Storage full or blocked: the mode goes back to live next time.
      }
    },
  };
}
