import { describe, expect, it } from "vitest";
import { parseCatalog } from "../catalog/catalog";
import type { Clock } from "../lib/clock";
import { FakePlayer } from "../player/fake-player";
import { createTuner } from "./tuner";

const catalog = parseCatalog({
  schemaVersion: 1,
  channels: [
    { id: "80s", name: "80s", icon: "", order: 0, videoIds: ["a", "b", "c"] },
    { id: "90s", name: "90s", icon: "", order: 1, videoIds: ["x"] },
  ],
  videos: { a: {}, b: {}, c: {}, x: {} },
});

const clock: Clock = {
  now: () => 0,
  setTimeout: () => {
    throw new Error("unexpected timer");
  },
  clearTimeout: () => {},
};

function setup() {
  const player = new FakePlayer();
  const tuner = createTuner({ catalog, player, clock, random: () => 0 });
  return { player, tuner };
}

const loadedIds = (player: FakePlayer) => player.loads.map((l) => l.videoId);

describe("tuner", () => {
  it("plays the first video of the channel from the start", () => {
    const { player, tuner } = setup();

    tuner.tune("80s");

    expect(player.loads).toEqual([{ videoId: "a", startSec: 0 }]);
  });

  it("plays the next video when the current one ends", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");

    player.end();

    expect(player.current).toEqual({ videoId: "b", startSec: 0 });
  });

  it("loops back to the first video after the last one ends", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");

    player.end();
    player.end();
    player.end();

    expect(loadedIds(player)).toEqual(["a", "b", "c", "a"]);
  });

  it("replays the only video of a single-video channel", () => {
    const { player, tuner } = setup();
    tuner.tune("90s");

    player.end();

    expect(loadedIds(player)).toEqual(["x", "x"]);
  });

  it("skips to the next video when the current one fails", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");

    player.fail();

    expect(player.current).toEqual({ videoId: "b", startSec: 0 });
  });

  it("ignores an error reported for a video that is no longer playing", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    player.end();

    tuner.onError("a");

    expect(loadedIds(player)).toEqual(["a", "b"]);
  });

  it("starts over from the first video when tuning to another channel", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    player.end();

    tuner.tune("90s");
    tuner.tune("80s");

    expect(loadedIds(player)).toEqual(["a", "b", "x", "a"]);
  });

  it("refuses to tune to an unknown channel", () => {
    const { player, tuner } = setup();

    expect(() => tuner.tune("nope")).toThrow('Canal "nope" não existe no catálogo');
    expect(player.loads).toEqual([]);
  });

  it("reports the channel and video being played", () => {
    const { player, tuner } = setup();
    expect(tuner.current()).toBeUndefined();

    tuner.tune("80s");
    player.end();

    expect(tuner.current()).toEqual({ channelId: "80s", videoId: "b" });
  });
});

describe("onNowPlaying", () => {
  it("fires when tuning and when the next clip starts", () => {
    const { player, tuner } = setup();
    const seen: string[] = [];
    tuner.onNowPlaying((n) => seen.push(`${n.channelId}:${n.videoId}`));
    tuner.tune("80s");
    player.end();
    tuner.tune("90s");
    expect(seen).toEqual(["80s:a", "80s:b", "90s:x"]);
  });
});
