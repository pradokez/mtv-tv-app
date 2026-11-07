import { describe, expect, it } from "vitest";
import { parseCatalog } from "../catalog/catalog";
import type { Clock } from "../lib/clock";
import { FakePlayer } from "../player/fake-player";
import { createQueue } from "../queue/queue";
import { createTuner, ZAP_DEBOUNCE_MS } from "./tuner";

const catalog = parseCatalog({
  schemaVersion: 1,
  channels: [
    { id: "80s", name: "80s", icon: "", order: 0, videoIds: ["a", "b", "c"] },
    { id: "90s", name: "90s", icon: "", order: 1, videoIds: ["x"] },
    { id: "00s", name: "00s", icon: "", order: 2, videoIds: ["m", "n"] },
  ],
  videos: { a: {}, b: {}, c: {}, x: {}, m: {}, n: {} },
});

/** Clock whose timers only fire when the test advances time. */
function fakeClock(): Clock & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    setTimeout(callback, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout(id) {
      timers.delete(id as unknown as number);
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now && timers.delete(id)) timer.callback();
      }
    },
    pending: () => timers.size,
  };
}

// `random: () => 0.5` gives every channel the same seed, so the expected
// order of a channel is that of a Queue built with it.
const SEED = Math.floor(0.5 * 2 ** 32);
const orderOf = (channelId: string, n: number) => {
  const queue = createQueue(catalog.channel(channelId)!.videoIds, SEED);
  return Array.from({ length: n }, () => queue.next());
};

function setup(fromCatalog = catalog) {
  const player = new FakePlayer();
  const clock = fakeClock();
  const tuner = createTuner({ catalog: fromCatalog, player, clock, random: () => 0.5 });
  return { player, clock, tuner };
}

const loadedIds = (player: FakePlayer) => player.loads.map((l) => l.videoId);

describe("tuner", () => {
  it("plays the first video of the channel's queue from the start", () => {
    const { player, tuner } = setup();

    tuner.tune("80s");

    expect(player.loads).toEqual([{ videoId: orderOf("80s", 1)[0], startSec: 0 }]);
  });

  it("plays the next video of the queue when the current one ends", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");

    player.end();
    player.end();
    player.end();
    player.end();

    expect(loadedIds(player)).toEqual(orderOf("80s", 5).slice(0, 5));
    expect(loadedIds(player).slice(0, 3).sort()).toEqual(["a", "b", "c"]);
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

    expect(loadedIds(player)).toEqual(orderOf("80s", 2));
  });

  it("ignores an error reported for a video that is no longer playing", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    const first = tuner.current()!.videoId;
    player.end();

    tuner.onError(first);

    expect(player.loads).toHaveLength(2);
  });

  it("continues the channel's queue when coming back to it", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    tuner.tune("90s");
    tuner.tune("80s");

    expect(loadedIds(player)).toEqual([...orderOf("80s", 1), "x", orderOf("80s", 2)[1]]);
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

    expect(tuner.current()).toEqual({ channelId: "80s", videoId: orderOf("80s", 2)[1] });
  });

  describe("zapping", () => {
    it("goes to the next channel on channelUp, once the zapping settles", () => {
      const { player, tuner, clock } = setup();
      tuner.tune("80s");

      tuner.channelUp();
      expect(player.loads).toHaveLength(1);
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(tuner.current()?.channelId).toBe("90s");
      expect(player.loads).toHaveLength(2);
    });

    it("goes to the previous channel on channelDown", () => {
      const { tuner, clock } = setup();
      tuner.tune("90s");

      tuner.channelDown();
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(tuner.current()?.channelId).toBe("80s");
    });

    it("wraps around past the last channel and before the first", () => {
      const { tuner, clock } = setup();
      tuner.tune("00s");

      tuner.channelUp();
      clock.advance(ZAP_DEBOUNCE_MS);
      expect(tuner.current()?.channelId).toBe("80s");

      tuner.channelDown();
      clock.advance(ZAP_DEBOUNCE_MS);
      expect(tuner.current()?.channelId).toBe("00s");
    });

    it("loads only the channel where a burst of 10 changes in 2 s stopped", () => {
      const { player, tuner, clock } = setup();
      tuner.tune("80s");

      for (let i = 0; i < 10; i++) {
        tuner.channelUp();
        clock.advance(200);
      }
      expect(player.loads).toHaveLength(1);
      clock.advance(ZAP_DEBOUNCE_MS);

      // 10 steps up from 80s over 3 channels: 80s -> ... -> 90s
      expect(tuner.current()?.channelId).toBe("90s");
      expect(player.loads).toHaveLength(2);
    });

    it("keeps playing the current video while zapping is pending", () => {
      const { player, tuner, clock } = setup();
      tuner.tune("80s");
      const playing = tuner.current();

      tuner.channelUp();
      clock.advance(ZAP_DEBOUNCE_MS - 1);

      expect(tuner.current()).toEqual(playing);
      expect(player.loads).toHaveLength(1);
    });

    it("does nothing when zapping ends back on the channel already playing", () => {
      const { player, tuner, clock } = setup();
      tuner.tune("80s");

      tuner.channelUp();
      tuner.channelDown();
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(player.loads).toHaveLength(1);
      expect(clock.pending()).toBe(0);
    });

    it("tunes immediately on tune() and cancels pending zapping", () => {
      const { player, tuner, clock } = setup();
      tuner.tune("80s");
      tuner.channelUp();

      tuner.tune("00s");
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(tuner.current()?.channelId).toBe("00s");
      expect(player.loads).toHaveLength(2);
    });

    it("ignores the player ending or failing a video while zapping is pending", () => {
      const { player, tuner, clock } = setup();
      tuner.tune("80s");
      tuner.channelUp();

      player.end();
      player.fail();
      expect(player.loads).toHaveLength(1);
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(player.loads).toHaveLength(2);
      expect(tuner.current()?.channelId).toBe("90s");
    });

    it("does nothing before any channel is tuned", () => {
      const { player, tuner, clock } = setup();

      tuner.channelUp();
      tuner.skip();
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(player.loads).toEqual([]);
    });
  });

  describe("skip", () => {
    it("moves on to the next video of the queue after the debounce", () => {
      const { player, tuner, clock } = setup();
      tuner.tune("80s");

      tuner.skip();
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(loadedIds(player)).toEqual(orderOf("80s", 2));
    });

    it("loads only the last video after several quick skips", () => {
      const { player, tuner, clock } = setup();
      tuner.tune("80s");

      tuner.skip();
      tuner.skip();
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(loadedIds(player)).toEqual([orderOf("80s", 1)[0], orderOf("80s", 3)[2]]);
    });

    it("skips the first video of the channel being zapped to", () => {
      const { tuner, clock } = setup();
      tuner.tune("90s");

      tuner.channelUp();
      tuner.skip();
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(tuner.current()).toEqual({ channelId: "00s", videoId: orderOf("00s", 2)[1] });
    });
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
    const [first, second] = orderOf("80s", 2);
    expect(seen).toEqual([`80s:${first}`, `80s:${second}`, "90s:x"]);
  });

  it("fires only once zapping settles, not on each intermediate channel", () => {
    const { tuner, clock } = setup();
    tuner.tune("80s");
    const seen: string[] = [];
    tuner.onNowPlaying((n) => seen.push(n.channelId));

    tuner.channelUp();
    tuner.channelUp();
    expect(seen).toEqual([]);
    clock.advance(ZAP_DEBOUNCE_MS);

    expect(seen).toEqual(["00s"]);
  });
});

describe("failed videos", () => {
  it("never plays a failed video again on that channel", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    const [failed] = orderOf("80s", 1);

    player.fail();
    for (let i = 0; i < 6; i++) player.end();

    expect(loadedIds(player)).toHaveLength(8);
    expect(loadedIds(player).slice(1)).not.toContain(failed);
  });

  it("skips a failed video on any channel that has it", () => {
    const shared = parseCatalog({
      schemaVersion: 1,
      channels: [
        { id: "one", name: "One", icon: "", order: 0, videoIds: ["s"] },
        { id: "two", name: "Two", icon: "", order: 1, videoIds: ["s", "t"] },
      ],
      videos: { s: {}, t: {} },
    });
    const { player, tuner } = setup(shared);
    tuner.tune("one");
    player.fail();

    for (let i = 0; i < 4; i++) tuner.tune("two");

    expect(loadedIds(player)).toEqual(["s", "t", "t", "t", "t"]);
  });

  it("does not land on a failed video drawn by a skip", () => {
    const { player, tuner, clock } = setup();
    tuner.tune("00s");
    const [failed, other] = orderOf("00s", 2);
    player.fail();

    tuner.skip();
    clock.advance(ZAP_DEBOUNCE_MS);

    expect(loadedIds(player)).toEqual([failed, other, other]);
  });

  describe("channel with every video failed", () => {
    it("stops loading and reports the channel unavailable", () => {
      const { player, tuner } = setup();
      const statuses: string[] = [];
      tuner.onStatus((status) => statuses.push(status));
      tuner.tune("90s");

      player.fail();
      player.end();

      expect(loadedIds(player)).toEqual(["x"]);
      expect(statuses).toEqual(["playing", "unavailable"]);
      expect(tuner.current()).toBeUndefined();
    });

    it("plays again after zapping away from it", () => {
      const { player, tuner, clock } = setup();
      const statuses: string[] = [];
      tuner.onStatus((status) => statuses.push(status));
      tuner.tune("90s");
      player.fail();

      tuner.channelUp();
      clock.advance(ZAP_DEBOUNCE_MS);

      expect(loadedIds(player)).toEqual(["x", orderOf("00s", 1)[0]]);
      expect(statuses).toEqual(["playing", "unavailable", "playing"]);
    });

    it("is reported unavailable right away when tuned to again", () => {
      const { player, tuner } = setup();
      tuner.tune("90s");
      player.fail();
      tuner.tune("80s");
      const statuses: string[] = [];
      const started: string[] = [];
      tuner.onStatus((status) => statuses.push(status));
      tuner.onNowPlaying((n) => started.push(n.videoId));

      tuner.tune("90s");

      expect(loadedIds(player)).toEqual(["x", orderOf("80s", 1)[0]]);
      expect(statuses).toEqual(["unavailable"]);
      expect(started).toEqual([]);
    });
  });
});

describe("connection", () => {
  it("neither marks nor skips a video that fails while offline", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    const playing = tuner.current();

    tuner.setOnline(false);
    player.fail();

    expect(player.loads).toHaveLength(1);
    expect(tuner.current()).toEqual(playing);
  });

  it("reloads the current video from the start when the connection comes back", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");
    tuner.setOnline(false);
    player.fail();

    tuner.setOnline(true);

    const [first] = orderOf("80s", 1);
    expect(player.loads).toEqual([
      { videoId: first, startSec: 0 },
      { videoId: first, startSec: 0 },
    ]);
  });

  it("does not reload when told it is online without having been offline", () => {
    const { player, tuner } = setup();
    tuner.tune("80s");

    tuner.setOnline(true);

    expect(player.loads).toHaveLength(1);
  });

  it("does not reload anything when the connection comes back on an unavailable channel", () => {
    const { player, tuner } = setup();
    tuner.tune("90s");
    player.fail();
    tuner.setOnline(false);

    tuner.setOnline(true);

    expect(loadedIds(player)).toEqual(["x"]);
  });
});
