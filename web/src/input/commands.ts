/**
 * What the user asked for, independent of which key produced it. The Input
 * Mapper turns key events into commands; the app dispatches them to the Tuner
 * and the overlays.
 */
export type Command =
  | { type: "channelUp" }
  | { type: "channelDown" }
  /** Show the lower third with the current clip. */
  | { type: "showInfo" }
  | { type: "openGuide" }
  /** Skip the current clip (queue mode only). */
  | { type: "skip" }
  /** Close the open overlay, or ask to exit when none is open. */
  | { type: "back" }
  | { type: "guideUp" }
  | { type: "guideDown" }
  /** Tune to the channel focused in the guide. */
  | { type: "guideSelect" }
  | { type: "none" };

export type CommandType = Command["type"];

/** UI state the mapping depends on. */
export interface UiState {
  overlay: "none" | "guide" | "info" | "exitConfirm";
  mode: "queue" | "live";
}

/**
 * Key event as seen by the mapper: only `KeyboardEvent.key`. The Android shell
 * forwards remote keys as standard DOM key values (`ArrowUp`, `Enter`,
 * `ChannelUp`, `ChannelDown`, `GoBack`…), so no Android keycodes leak here.
 */
export interface KeyInput {
  key: string;
}
