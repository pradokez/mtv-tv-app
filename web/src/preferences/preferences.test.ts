import { describe, expect, it } from "vitest";
import { createPreferences, type KeyValueStorage } from "./preferences";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const brokenStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("preferences", () => {
  it("has no last channel on first use", () => {
    expect(createPreferences(memoryStorage()).lastChannel()).toBeUndefined();
  });

  it("remembers the last channel across instances sharing the storage", () => {
    const storage = memoryStorage();
    createPreferences(storage).setLastChannel("90s");

    expect(createPreferences(storage).lastChannel()).toBe("90s");
  });

  it("survives a storage that throws", () => {
    const preferences = createPreferences(brokenStorage);

    expect(() => preferences.setLastChannel("90s")).not.toThrow();
    expect(preferences.lastChannel()).toBeUndefined();
  });

  it("persists favorites and toggles them off", () => {
    const storage = memoryStorage();
    const preferences = createPreferences(storage);

    expect(preferences.toggleFavorite("90s")).toBe(true);
    expect(preferences.toggleFavorite("80s")).toBe(true);
    expect(createPreferences(storage).favorites()).toEqual(["90s", "80s"]);
    expect(preferences.toggleFavorite("90s")).toBe(false);
    expect(createPreferences(storage).favorites()).toEqual(["80s"]);
  });

  it("persists the favorites-only setting, off by default", () => {
    const storage = memoryStorage();
    expect(createPreferences(storage).favoritesOnly()).toBe(false);

    createPreferences(storage).setFavoritesOnly(true);

    expect(createPreferences(storage).favoritesOnly()).toBe(true);
  });

  it("ignores corrupted favorites", () => {
    const storage = memoryStorage();
    storage.setItem("mtv-tv.favorites", "{nope");

    expect(createPreferences(storage).favorites()).toEqual([]);
  });

  it("keeps favorites for the session with a storage that throws", () => {
    const preferences = createPreferences(brokenStorage);

    expect(preferences.toggleFavorite("90s")).toBe(true);
    expect(preferences.favorites()).toEqual(["90s"]);
    expect(preferences.favoritesOnly()).toBe(false);
  });
});
