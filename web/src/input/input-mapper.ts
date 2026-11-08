import type { Command, KeyInput, UiState } from "./commands";

const NONE: Command = { type: "none" };

/**
 * Translates a key press into a command, given the current UI state.
 * Covers OK, Back, zapping (arrows, CH+/CH-, PageUp/PageDown as their Mac
 * equivalent), skip and the guide (← opens it; inside, ↑/↓ move, OK selects and
 * → toggles the favorite). Zapping keeps working under the lower third, which
 * opens on every channel change.
 */
export function map(event: KeyInput, ui: UiState): Command {
  const zappable = ui.overlay === "none" || ui.overlay === "info";
  const inGuide = ui.overlay === "guide";
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
      if (inGuide) return { type: "guideUp" };
      return zappable ? { type: "channelUp" } : NONE;
    case "ArrowDown":
    case "ChannelDown":
    case "PageDown":
      if (inGuide) return { type: "guideDown" };
      return zappable ? { type: "channelDown" } : NONE;
    case "ArrowLeft":
      if (ui.overlay === "exitConfirm") return { type: "exitMove" };
      return zappable ? { type: "openGuide" } : NONE;
    case "ArrowRight":
      if (ui.overlay === "exitConfirm") return { type: "exitMove" };
      if (inGuide) return { type: "guideToggle" };
      return zappable && ui.mode === "queue" ? { type: "skip" } : NONE;
    default:
      return NONE;
  }
}
