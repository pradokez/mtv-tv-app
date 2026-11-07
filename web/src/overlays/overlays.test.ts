import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../lib/clock";
import { INFO_DURATION_MS, createOverlays } from "./overlays";

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (cb, ms) => {
      const id = ++nextId;
      timers.set(id, { at: now + ms, cb });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (id) => void timers.delete(id as unknown as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...timers]) {
      if (t.at <= now) {
        timers.delete(id);
        t.cb();
      }
    }
  };
  return { clock, advance };
}

const lines = ["a-ha", "“Take On Me”", "Anos 80"];

function setup() {
  const { clock, advance } = fakeClock();
  const onExit = vi.fn();
  const overlays = createOverlays({ clock, onExit });
  return { overlays, advance, onExit };
}

describe("overlays", () => {
  it("starts closed", () => {
    expect(setup().overlays.state().overlay).toBe("none");
  });

  it("hides the lower third on demand", () => {
    const { overlays } = setup();
    overlays.showInfo(lines);

    overlays.hideInfo();

    expect(overlays.state().overlay).toBe("none");
  });

  it("leaves the exit confirmation open when asked to hide the lower third", () => {
    const { overlays } = setup();
    overlays.back();

    overlays.hideInfo();

    expect(overlays.state().overlay).toBe("exitConfirm");
  });

  it("shows the lower third and hides it by itself", () => {
    const { overlays, advance } = setup();
    overlays.showInfo(lines);
    expect(overlays.state()).toMatchObject({ overlay: "info", lines });
    advance(INFO_DURATION_MS - 1);
    expect(overlays.state().overlay).toBe("info");
    advance(1);
    expect(overlays.state().overlay).toBe("none");
  });

  it("restarts the timer when shown again", () => {
    const { overlays, advance } = setup();
    overlays.showInfo(lines);
    advance(INFO_DURATION_MS - 100);
    overlays.showInfo(lines);
    advance(INFO_DURATION_MS - 1);
    expect(overlays.state().overlay).toBe("info");
  });

  it("Back closes the lower third instead of asking to exit", () => {
    const { overlays } = setup();
    overlays.showInfo(lines);
    overlays.back();
    expect(overlays.state().overlay).toBe("none");
  });

  it("Back with nothing open asks to exit, defaulting to Continue", () => {
    const { overlays } = setup();
    overlays.back();
    expect(overlays.state()).toMatchObject({ overlay: "exitConfirm", exitChoice: "continue" });
  });

  it("Back again cancels the confirmation", () => {
    const { overlays, onExit } = setup();
    overlays.back();
    overlays.back();
    expect(overlays.state().overlay).toBe("none");
    expect(onExit).not.toHaveBeenCalled();
  });

  it("moves between Exit and Continue and exits on select", () => {
    const { overlays, onExit } = setup();
    overlays.back();
    overlays.exitMove();
    expect(overlays.state().exitChoice).toBe("exit");
    overlays.exitSelect();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("selecting Continue closes the confirmation", () => {
    const { overlays, onExit } = setup();
    overlays.back();
    overlays.exitSelect();
    expect(overlays.state().overlay).toBe("none");
    expect(onExit).not.toHaveBeenCalled();
  });

  it("a new clip does not cover the exit confirmation", () => {
    const { overlays } = setup();
    overlays.back();
    overlays.showInfo(lines);
    expect(overlays.state().overlay).toBe("exitConfirm");
  });
});
