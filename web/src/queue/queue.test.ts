import { describe, expect, it } from "vitest";
import { createQueue } from "./queue";

const ids = ["a", "b", "c", "d", "e", "f"];

const take = (queue: ReturnType<typeof createQueue>, n: number) =>
  Array.from({ length: n }, () => queue.next());

describe("queue", () => {
  it("gives the same order for the same seed", () => {
    expect(take(createQueue(ids, 42), 12)).toEqual(take(createQueue(ids, 42), 12));
  });

  it("gives different orders for different seeds", () => {
    const orders = [1, 2, 3, 4, 5].map((seed) => take(createQueue(ids, seed), 6).join(""));
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("plays every video once before repeating any", () => {
    const first = take(createQueue(ids, 7), ids.length);
    expect([...first].sort()).toEqual(ids);
  });

  it("starts a new cycle with every video again once the playlist is exhausted", () => {
    const queue = createQueue(ids, 7);
    take(queue, ids.length);

    const second = take(queue, ids.length);

    expect([...second].sort()).toEqual(ids);
  });

  it("never repeats a video back to back across cycles", () => {
    for (let seed = 0; seed < 200; seed++) {
      const played = take(createQueue(ids, seed), ids.length * 4);
      played.slice(1).forEach((id, i) => expect(id).not.toBe(played[i]));
    }
  });

  it("skip advances to the next video", () => {
    const reference = take(createQueue(ids, 3), 3);
    const queue = createQueue(ids, 3);
    queue.next();

    expect(queue.skip()).toBe(reference[1]);
    expect(queue.current()).toBe(reference[1]);
    expect(queue.next()).toBe(reference[2]);
  });

  it("reports no current video before the first one is drawn", () => {
    expect(createQueue(ids, 1).current()).toBeUndefined();
  });

  it("replays the only video of a single-video playlist", () => {
    const queue = createQueue(["x"], 1);
    expect(take(queue, 3)).toEqual(["x", "x", "x"]);
  });
});
