/**
 * Narrow interface over the video player, so the Tuner can be driven by the
 * real YouTube IFrame player in the app and by a fake one in tests and dev.
 */
export interface PlayerAdapter {
  /** Starts playing `videoId` from `startSec`, replacing whatever was playing. */
  load(videoId: string, startSec: number): void;
  /** Called when the loaded video plays to the end. */
  onEnded(listener: (videoId: string) => void): Unsubscribe;
  /** Called when the loaded video can't be played (removed, private, embed blocked…). */
  onError(listener: (videoId: string, code: number) => void): Unsubscribe;
}

export type Unsubscribe = () => void;

/** Minimal listener registry shared by the adapters. */
export function createEmitter<Args extends unknown[]>() {
  const listeners = new Set<(...args: Args) => void>();
  return {
    on(listener: (...args: Args) => void): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(...args: Args): void {
      for (const listener of [...listeners]) listener(...args);
    },
  };
}
