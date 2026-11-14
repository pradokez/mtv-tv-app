const MAX_LINES = 16;

let sink: ((line: string) => void) | undefined;

/** `?debug=1` turns on the on-screen diagnostics (a TV has no remote console). */
export function debugRequested(search: string): boolean {
  return new URLSearchParams(search).get("debug") === "1";
}

/** Records a diagnostic line; does nothing unless the overlay is installed. */
export function debugLog(message: string): void {
  sink?.(message);
}

/**
 * Shows the last diagnostic lines in a corner of the screen and feeds it with
 * the page's errors and CSP violations. Returns whether it was turned on.
 */
export function installDebugOverlay(win: Window, info: Record<string, string>): boolean {
  if (!debugRequested(win.location.search)) return false;
  const doc = win.document;
  const panel = doc.createElement("pre");
  panel.className = "debug-panel";
  doc.body.append(panel);
  const lines: string[] = [];
  const t0 = Date.now();
  sink = (message) => {
    lines.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${message}`);
    if (lines.length > MAX_LINES) lines.shift();
    panel.textContent = lines.join("\n");
  };

  sink(`origin ${win.location.origin}`);
  for (const [key, value] of Object.entries(info)) sink(`${key} ${value}`);
  sink(`ua ${win.navigator.userAgent.replace(/^.*AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) /, "")}`);
  sink(`tizen ${typeof (win as unknown as { tizen?: unknown }).tizen}, referrer "${doc.referrer}"`);

  win.addEventListener("error", (e) => sink?.(`erro ${e.message} (${e.filename.split("/").pop()}:${e.lineno})`));
  win.addEventListener("unhandledrejection", (e) => sink?.(`rejeição ${String(e.reason)}`));
  doc.addEventListener("securitypolicyviolation", (e) => sink?.(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    sink?.(`console.error ${args.map(String).join(" ")}`);
    original(...args);
  };
  return true;
}
