import type { Command, KeyInput, UiState } from "./commands";

const NONE: Command = { type: "none" };

/**
 * Translates a key press into a command, given the current UI state.
 * The table (arrows, OK, CH+/CH-, Back) is filled in by later slices.
 */
export function map(_event: KeyInput, _ui: UiState): Command {
  return NONE;
}
