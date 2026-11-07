/**
 * Reports whether the device has a network connection: once right away, then
 * on every change. Uses the browser's `online`/`offline` events, which the
 * Android WebView fires when the TV loses or regains its connection.
 */
export function watchConnectivity(listener: (online: boolean) => void): void {
  listener(navigator.onLine);
  window.addEventListener("online", () => listener(true));
  window.addEventListener("offline", () => listener(false));
}
