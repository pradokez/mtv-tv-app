import type { Clock, TimerId } from "../lib/clock";
import type { GuideRow } from "./guide";

/** How long the lower third stays on screen before hiding by itself. */
export const INFO_DURATION_MS = 6000;

export type ExitChoice = "continue" | "exit";

export interface OverlayState {
  overlay: "none" | "guide" | "info" | "exitConfirm";
  /** Lines of the lower third while `overlay` is `info`. */
  lines: readonly string[];
  /** Highlighted option while `overlay` is `exitConfirm`. */
  exitChoice: ExitChoice;
  /** Rows of the guide and the index of the focused one, while `overlay` is `guide`. */
  guide: { rows: readonly GuideRow[]; focus: number };
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
  /** Closes the open overlay; with none open, asks to exit. */
  back(): void;
  exitMove(): void;
  exitSelect(): void;
  /** Opens the guide over the video, focused on `focusChannelId` (or the first channel). */
  openGuide(rows: readonly GuideRow[], focusChannelId: string | undefined): void;
  /** Moves the guide focus; it stops at both ends. */
  guideMove(step: 1 | -1): void;
  /** The focused row while the guide is open. */
  guideFocused(): GuideRow | undefined;
  /** Replaces the rows (a favorite changed), keeping the focus on the same row. */
  setGuideRows(rows: readonly GuideRow[]): void;
}

export function createOverlays({ clock, onExit, onChange }: OverlaysDeps): Overlays {
  let state: OverlayState = { overlay: "none", lines: [], exitChoice: "continue", guide: { rows: [], focus: 0 } };
  let hideTimer: TimerId | undefined;

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

  const rowKey = (row: GuideRow | undefined) => (row?.kind === "channel" ? row.id : row?.kind);

  return {
    state: () => state,
    showInfo(lines) {
      if (state.overlay === "exitConfirm" || state.overlay === "guide") return;
      clearTimer();
      set({ overlay: "info", lines });
      hideTimer = clock.setTimeout(close, INFO_DURATION_MS);
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
    openGuide(rows, focusChannelId) {
      if (state.overlay === "exitConfirm" || state.overlay === "guide") return;
      clearTimer();
      const at = rows.findIndex((r) => r.kind === "channel" && r.id === focusChannelId);
      // Row 0 is the favorites-only switch; without a match, start on the first channel.
      set({ overlay: "guide", guide: { rows, focus: at >= 0 ? at : Math.min(1, rows.length - 1) } });
    },
    guideMove(step) {
      if (state.overlay !== "guide") return;
      const { rows, focus } = state.guide;
      const next = Math.max(0, Math.min(rows.length - 1, focus + step));
      if (next !== focus) set({ guide: { rows, focus: next } });
    },
    guideFocused: () => (state.overlay === "guide" ? state.guide.rows[state.guide.focus] : undefined),
    setGuideRows(rows) {
      if (state.overlay !== "guide") return;
      const key = rowKey(state.guide.rows[state.guide.focus]);
      const at = rows.findIndex((r) => rowKey(r) === key);
      set({ guide: { rows, focus: at >= 0 ? at : Math.min(state.guide.focus, rows.length - 1) } });
    },
  };
}
