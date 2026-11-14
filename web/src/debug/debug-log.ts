const MAX_LINES = 22;

let sink: ((line: string) => void) | undefined;

/** Whether the overlay is on, to skip the cost of building diagnostics. */
export function debugActive(): boolean {
  return sink !== undefined;
}

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
  let last = "";
  let repeats = 1;
  sink = (message) => {
    // The same message in a row (the YouTube script's cross-origin errors) becomes one line with a count.
    if (message === last) {
      repeats++;
      lines.pop();
    } else {
      last = message;
      repeats = 1;
    }
    lines.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${message}${repeats > 1 ? ` (x${repeats})` : ""}`);
    if (lines.length > MAX_LINES) lines.shift();
    panel.textContent = lines.join("\n");
  };

  sink(`origin ${win.location.origin}`);
  for (const [key, value] of Object.entries(info)) sink(`${key} ${value}`);
  sink(`ua ${win.navigator.userAgent.replace(/^.*AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) /, "")}`);
  sink(`tizen ${typeof (win as unknown as { tizen?: unknown }).tizen}, referrer "${doc.referrer}"`);

  // The Tizen API may be injected after the page starts: look again.
  win.setTimeout(() => sink?.(`tizen depois de 3s: ${typeof (win as unknown as { tizen?: unknown }).tizen}`), 3000);

  win.addEventListener("error", (e) => sink?.(`erro ${e.message.replace(/Blocked a frame with origin .* from accessing/, "frame bloqueado, acesso a")} (${e.filename.split("/").pop()}:${e.lineno})`));
  win.addEventListener("unhandledrejection", (e) => sink?.(`rejeição ${String(e.reason)}`));
  doc.addEventListener("securitypolicyviolation", (e) => sink?.(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    sink?.(`console.error ${args.map(String).join(" ")}`);
    original(...args);
  };
  return true;
}
