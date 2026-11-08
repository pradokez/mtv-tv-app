/** When commercial breaks air between clips, and how long they are. */
export interface BreakRule {
  /** About one break every this many clips. */
  every: number;
  /** Commercials per break. */
  size: number;
}

export const DEFAULT_BREAK_RULE: BreakRule = { every: 4, size: 2 };
