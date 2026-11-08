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

  it("defaults to live mode and remembers the chosen mode", () => {
    const storage = memoryStorage();
    expect(createPreferences(storage).mode()).toBe("live");

    createPreferences(storage).setMode("queue");

    expect(createPreferences(storage).mode()).toBe("queue");
  });

  it("falls back to live mode when the stored value is invalid", () => {
    const storage = memoryStorage();
    storage.setItem("mtv-tv.mode", "bogus");

    expect(createPreferences(storage).mode()).toBe("live");
  });

  it("survives a storage that throws", () => {
    const preferences = createPreferences(brokenStorage);
    expect(() => preferences.setMode("queue")).not.toThrow();
    expect(preferences.mode()).toBe("live");

    expect(() => preferences.setLastChannel("90s")).not.toThrow();
    expect(preferences.lastChannel()).toBeUndefined();
  });
});
