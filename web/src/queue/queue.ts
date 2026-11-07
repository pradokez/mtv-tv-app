import { seededRandom } from "../lib/seeded-random";

/**
 * Shuffled play order for one channel (queue mode). Plays every video once
 * before any repeats, then reshuffles; the first video of a new cycle is never
 * the last one of the previous cycle.
 */
export interface Queue {
  /** Draws the next video and makes it the current one. */
  next(): string;
  /** Gives up on the current video and draws the next one. */
  skip(): string;
  /** The video drawn last, or `undefined` before the first draw. */
  current(): string | undefined;
}

export function createQueue(videoIds: readonly string[], seed: number): Queue {
  if (videoIds.length === 0) throw new Error("Fila sem vídeos");

  let cycle = 0;
  let order = shuffle(videoIds, seed, cycle);
  let position = -1;
  let currentId: string | undefined;

  const next = () => {
    position++;
    if (position >= order.length) {
      cycle++;
      order = shuffle(videoIds, seed, cycle);
      if (order.length > 1 && order[0] === currentId) {
        [order[0], order[1]] = [order[1]!, order[0]!];
      }
      position = 0;
    }
    currentId = order[position]!;
    return currentId;
  };

  return { next, skip: next, current: () => currentId };
}

/** Fisher-Yates with a per-cycle seed derived from the channel seed. */
function shuffle(videoIds: readonly string[], seed: number, cycle: number): string[] {
  const random = seededRandom(seed + Math.imul(cycle, 0x9e3779b1));
  const result = [...videoIds];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
