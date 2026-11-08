import type { Command, KeyInput, UiState } from "./commands";

const NONE: Command = { type: "none" };

/**
 * Translates a key press into a command, given the current UI state.
 * Covers OK, Back and zapping (arrows, CH+/CH-, PageUp/PageDown as their Mac
 * equivalent) plus skip; the guide keys are added by a later slice. Zapping
 * keeps working under the lower third, which opens on every channel change.
 */
export function map(event: KeyInput, ui: UiState): Command {
  const zappable = ui.overlay === "none" || ui.overlay === "info";
  switch (event.key) {
    case "Escape":
    case "GoBack":
      return { type: "back" };
    case "Enter":
      if (ui.overlay === "guide") return { type: "guideSelect" };
      if (ui.overlay === "exitConfirm") return { type: "exitSelect" };
      return { type: "showInfo" };
    case "ArrowUp":
    case "ChannelUp":
    case "PageUp":
      return zappable ? { type: "channelUp" } : NONE;
    case "ArrowDown":
    case "ChannelDown":
    case "PageDown":
      return zappable ? { type: "channelDown" } : NONE;
    case "ArrowLeft":
      return ui.overlay === "exitConfirm" ? { type: "exitMove" } : NONE;
    case "ArrowRight":
      if (ui.overlay === "exitConfirm") return { type: "exitMove" };
      if (!zappable) return NONE;
      return ui.mode === "queue" ? { type: "skip" } : { type: "skipBlocked" };
    case "m":
    case "M":
    case "ContextMenu":
    case "ColorF2Yellow":
      return zappable ? { type: "toggleMode" } : NONE;
    default:
      return NONE;
  }
}
