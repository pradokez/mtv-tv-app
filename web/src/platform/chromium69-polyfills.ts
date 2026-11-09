/**
 * Runtime APIs the app uses that the Samsung Q80's Chromium 69 lacks. Only the
 * Tizen build (`--mode tizen`) installs them; see `docs/chromium69-apis.md`.
 */

type ReplaceChildren = (this: Element, ...nodes: (Node | string)[]) => void;

/** `Element.replaceChildren` (Chromium 86): empties the element, then appends. */
export function installReplaceChildren(proto: { replaceChildren?: ReplaceChildren }): void {
  if (typeof proto.replaceChildren === "function") return;
  proto.replaceChildren = function (...nodes) {
    this.textContent = "";
    this.append(...nodes);
  };
}

export function installChromium69Polyfills(): void {
  installReplaceChildren(Element.prototype);
}
