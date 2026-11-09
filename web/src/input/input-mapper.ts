import { PLAY_PAUSE_KEY, type Command, type KeyInput, type UiState } from "./commands";

const NONE: Command = { type: "none" };

/**
 * Translates a key press into a command, given the current UI state.
 * Covers OK, Back, zapping (arrows, CH+/CH-, PageUp/PageDown as their Mac
 * equivalent), skip, Info (lower third) and the guide (← opens it; inside, ↑/↓ move, OK selects and
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
      if (!zappable) return NONE;
      return ui.mode === "queue" ? { type: "skip" } : { type: "skipBlocked" };
    case "Info":
    case "i":
    case "I":
      return zappable ? { type: "showInfo" } : NONE;
    case "m":
    case "M":
    case "ContextMenu":
    case "ColorF2Yellow":
    case PLAY_PAUSE_KEY:
      return zappable ? { type: "toggleMode" } : NONE;
    default:
      return NONE;
  }
}
