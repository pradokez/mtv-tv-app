/** The slice of `Storage` the app uses, so tests can pass an in-memory one. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export interface Preferences {
  /** Channel watched last, if any. */
  lastChannel(): string | undefined;
  setLastChannel(channelId: string): void;
}

const LAST_CHANNEL_KEY = "mtv-tv.lastChannel";

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
  };
}
