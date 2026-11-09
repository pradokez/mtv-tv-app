import type { PlaybackMode } from "../preferences/preferences";

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
  /** Skip was asked in live mode, where the grid can't be skipped. */
  | { type: "skipBlocked" }
  /** Switch between live and queue mode. */
  | { type: "toggleMode" }
  /** Close the open overlay, or ask to exit when none is open. */
  | { type: "back" }
  | { type: "guideUp" }
  | { type: "guideDown" }
  /** Tune to the channel focused in the guide (or change the focused setting). */
  | { type: "guideSelect" }
  /** Mark or unmark the channel focused in the guide as favorite. */
  | { type: "guideToggle" }
  /** Switch between "Sair" and "Continuar" in the exit confirmation. */
  | { type: "exitMove" }
  /** Pick the highlighted option of the exit confirmation. */
  | { type: "exitSelect" }
  | { type: "none" };

export type CommandType = Command["type"];

/** UI state the mapping depends on. */
export interface UiState {
  overlay: "none" | "guide" | "info" | "exitConfirm";
  mode: PlaybackMode;
}

/**
 * Key event as seen by the mapper: only `KeyboardEvent.key`. The Android shell
 * forwards remote keys as standard DOM key values (`ArrowUp`, `Enter`,
 * `ChannelUp`, `ChannelDown`, `GoBack`…), so no Android keycodes leak here.
 */
export interface KeyInput {
  key: string;
}

/**
 * Logical key for the remote's Play/Pause button (standard DOM value). It
 * toggles live ↔ queue, like yellow/Menu/M, and its default (pausing media)
 * is always suppressed. Platform layers that receive a native Play/Pause code
 * must convert it to this `key` before dispatching the event.
 */
export const PLAY_PAUSE_KEY = "MediaPlayPause";
