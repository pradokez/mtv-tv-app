/**
 * Full-screen message over the player (no connection, channel unavailable).
 * Opaque, so YouTube's own error screen underneath is never seen.
 */
export interface StatusOverlay {
  show(message: string, hint?: string): void;
  hide(): void;
}

export function createStatusOverlay(container: HTMLElement): StatusOverlay {
  const el = document.createElement("p");
  el.className = "status-overlay";
  el.setAttribute("role", "status");
  el.hidden = true;
  container.append(el);
  return {
    show(message, hint) {
      el.textContent = message;
      if (hint !== undefined) {
        const line = document.createElement("span");
        line.className = "status-hint";
        line.textContent = hint;
        el.append(line);
      }
      el.hidden = false;
    },
    hide() {
      el.hidden = true;
    },
  };
}
