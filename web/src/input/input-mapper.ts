import type { Command, KeyInput, UiState } from "./commands";

const NONE: Command = { type: "none" };

/**
 * Translates a key press into a command, given the current UI state.
 * Covers OK and Back; zapping and the guide keys are added by later slices.
 */
export function map(event: KeyInput, ui: UiState): Command {
  switch (event.key) {
    case "Escape":
    case "GoBack":
      return { type: "back" };
    case "Enter":
      if (ui.overlay === "guide") return { type: "guideSelect" };
      if (ui.overlay === "exitConfirm") return { type: "exitSelect" };
      return { type: "showInfo" };
    case "ArrowLeft":
    case "ArrowRight":
      return ui.overlay === "exitConfirm" ? { type: "exitMove" } : NONE;
    default:
      return NONE;
  }
}
