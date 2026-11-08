/** The slice of `Storage` the app uses, so tests can pass an in-memory one. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/** `live`: grid driven by the clock; `queue`: shuffled queue the viewer can skip through. */
export type PlaybackMode = "live" | "queue";

export interface Preferences {
  /** Channel watched last, if any. */
  lastChannel(): string | undefined;
  setLastChannel(channelId: string): void;
  /** Favorite channel ids. */
  favorites(): string[];
  /** Adds or removes a favorite; returns whether the channel is now a favorite. */
  toggleFavorite(channelId: string): boolean;
  /** Whether zapping is restricted to the favorites. */
  favoritesOnly(): boolean;
  setFavoritesOnly(value: boolean): void;
  /** Playback mode; live unless the viewer chose the queue. */
  mode(): PlaybackMode;
  setMode(mode: PlaybackMode): void;
}

const LAST_CHANNEL_KEY = "mtv-tv.lastChannel";
const MODE_KEY = "mtv-tv.mode";
const FAVORITES_KEY = "mtv-tv.favorites";
const FAVORITES_ONLY_KEY = "mtv-tv.favoritesOnly";

/** Persists user preferences. A broken or unavailable storage is ignored: the app just forgets. */
export function createPreferences(storage: KeyValueStorage): Preferences {
  const read = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string) => {
    try {
      storage.setItem(key, value);
    } catch {
      // Storage full or blocked: the app just forgets.
    }
  };
  const readFavorites = (): string[] => {
    try {
      const parsed: unknown = JSON.parse(read(FAVORITES_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  };
  // A storage that throws still toggles within the session.
  let favorites: string[] | undefined;
  const current = () => (favorites ??= readFavorites());

  return {
    favorites: () => [...current()],
    toggleFavorite(channelId) {
      const list = current();
      const now = !list.includes(channelId);
      favorites = now ? [...list, channelId] : list.filter((id) => id !== channelId);
      write(FAVORITES_KEY, JSON.stringify(favorites));
      return now;
    },
    favoritesOnly: () => read(FAVORITES_ONLY_KEY) === "true",
    setFavoritesOnly: (value) => write(FAVORITES_ONLY_KEY, String(value)),
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
