/**
 * Injectable clock. Modules that depend on time (zapping debounce, live
 * schedule) receive one instead of calling `Date.now`/`setTimeout` directly,
 * so tests can drive time deterministically.
 */
export type TimerId = ReturnType<typeof setTimeout>;

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (id) => clearTimeout(id),
};
