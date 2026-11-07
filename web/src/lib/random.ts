/**
 * Injectable source of randomness: returns a float in [0, 1), like
 * `Math.random`. Tests pass a seeded or fixed implementation.
 */
export type Random = () => number;

export const mathRandom: Random = () => Math.random();
