import type { Clock, TimerId } from "../lib/clock";

/** How long the lower third stays on screen before hiding by itself. */
export const INFO_DURATION_MS = 6000;

/** How long a notice (mode switch, blocked skip) stays on screen. */
export const NOTICE_DURATION_MS = 2000;

export type ExitChoice = "continue" | "exit";

export interface OverlayState {
  overlay: "none" | "guide" | "info" | "exitConfirm";
  /** Lines of the lower third while `overlay` is `info`. */
  lines: readonly string[];
  /** Highlighted option while `overlay` is `exitConfirm`. */
  exitChoice: ExitChoice;
  /** Brief message shown over any overlay, if any. */
  notice?: string;
}

export interface OverlaysDeps {
  clock: Clock;
  /** The user confirmed leaving the app. */
  onExit: () => void;
  /** Called after every state change, to re-render. */
  onChange?: (state: OverlayState) => void;
}

/** Which overlay is open and what it shows. Rendering is up to `onChange`. */
export interface Overlays {
  state(): OverlayState;
  /** Shows the lower third, unless the exit confirmation is open. */
  showInfo(lines: readonly string[]): void;
  /** Hides the lower third if it is showing; any other overlay stays open. */
  hideInfo(): void;
  /** Shows a brief, discreet message that hides by itself. */
  showNotice(text: string): void;
  /** Closes the open overlay; with none open, asks to exit. */
  back(): void;
  exitMove(): void;
  exitSelect(): void;
}

export function createOverlays({ clock, onExit, onChange }: OverlaysDeps): Overlays {
  let state: OverlayState = { overlay: "none", lines: [], exitChoice: "continue" };
  let hideTimer: TimerId | undefined;
  let noticeTimer: TimerId | undefined;

  const clearTimer = () => {
    if (hideTimer !== undefined) clock.clearTimeout(hideTimer);
    hideTimer = undefined;
  };

  const set = (next: Partial<OverlayState>) => {
    state = { ...state, ...next };
    onChange?.(state);
  };

  const close = () => {
    clearTimer();
    set({ overlay: "none" });
  };

  return {
    state: () => state,
    showInfo(lines) {
      if (state.overlay === "exitConfirm" || state.overlay === "guide") return;
      clearTimer();
      set({ overlay: "info", lines });
      hideTimer = clock.setTimeout(close, INFO_DURATION_MS);
    },
    showNotice(text) {
      if (noticeTimer !== undefined) clock.clearTimeout(noticeTimer);
      set({ notice: text });
      noticeTimer = clock.setTimeout(() => {
        noticeTimer = undefined;
        set({ notice: undefined });
      }, NOTICE_DURATION_MS);
    },
    hideInfo() {
      if (state.overlay === "info") close();
    },
    back() {
      if (state.overlay === "none") {
        set({ overlay: "exitConfirm", exitChoice: "continue" });
      } else {
        close();
      }
    },
    exitMove() {
      if (state.overlay !== "exitConfirm") return;
      set({ exitChoice: state.exitChoice === "continue" ? "exit" : "continue" });
    },
    exitSelect() {
      if (state.overlay !== "exitConfirm") return;
      if (state.exitChoice === "exit") onExit();
      else close();
    },
  };
}
