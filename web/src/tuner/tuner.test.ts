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
    { id: "mix", name: "Mix", icon: "", order: 2, videoIds: ["a", "x"] },
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

  it("never plays a failed video again when the playlist loops", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");

    player.fail();
    player.end();
    player.end();

    expect(loadedIds(player)).toEqual(["a", "b", "c", "b"]);
  });

  it("skips a failed video when tuning to any channel that has it", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    player.fail();

    tuner.tune("80s");
    tuner.tune("mix");

    expect(loadedIds(player)).toEqual(["a", "b", "b", "x"]);
  });

  it("stops and reports the channel unavailable when all its videos fail", () => {
    const { player, tuner } = setup();
    const statuses: string[] = [];
    tuner.onStatus((status) => statuses.push(status));
    tuner.tune("80s");

    player.fail();
    player.fail();
    player.fail();
    player.end();

    expect(loadedIds(player)).toEqual(["a", "b", "c"]);
    expect(statuses).toEqual(["playing", "unavailable"]);
    expect(tuner.current()).toBeUndefined();
  });

  it("plays again after tuning away from an unavailable channel", () => {
    const { player, tuner } = setup();
    const statuses: string[] = [];
    tuner.onStatus((status) => statuses.push(status));
    tuner.tune("90s");
    player.fail();

    tuner.tune("80s");

    expect(loadedIds(player)).toEqual(["x", "a"]);
    expect(statuses).toEqual(["playing", "unavailable", "playing"]);
    expect(tuner.current()).toEqual({ channelId: "80s", videoId: "a" });
  });

  it("reports a channel unavailable right away when tuning to it after all its videos failed", () => {
    const { player, tuner } = setup();
    tuner.tune("90s");
    player.fail();
    tuner.tune("80s");
    const statuses: string[] = [];
    tuner.onStatus((status) => statuses.push(status));

    tuner.tune("90s");

    expect(loadedIds(player)).toEqual(["x", "a"]);
    expect(statuses).toEqual(["unavailable"]);
  });

  it("neither marks nor skips a video that fails while offline", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    player.end();

    tuner.setOnline(false);
    player.fail();

    expect(loadedIds(player)).toEqual(["a", "b"]);
    expect(tuner.current()).toEqual({ channelId: "80s", videoId: "b" });
  });

  it("reloads the current video from the start when the connection comes back", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    player.end();
    tuner.setOnline(false);
    player.fail();

    tuner.setOnline(true);

    expect(player.loads).toEqual([
      { videoId: "a", startSec: 0 },
      { videoId: "b", startSec: 0 },
      { videoId: "b", startSec: 0 },
    ]);
  });

  it("does not reload when told it is online without having been offline", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");

    tuner.setOnline(true);

    expect(loadedIds(player)).toEqual(["a"]);
  });

  it("does not reload anything when the connection comes back on an unavailable channel", () => {
    const { player, tuner } = setup();
    tuner.tune("90s");
    player.fail();
    tuner.setOnline(false);

    tuner.setOnline(true);

    expect(loadedIds(player)).toEqual(["x"]);
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
