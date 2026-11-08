import { describe, expect, it } from "vitest";
import type { UiState } from "./commands";
import { map } from "./input-mapper";

const state = (overlay: UiState["overlay"]): UiState => ({ overlay, mode: "queue" });

describe("map", () => {
  describe("OK (Enter)", () => {
    it.each(["none", "info"] as const)("shows the lower third with overlay %s", (overlay) => {
      expect(map({ key: "Enter" }, state(overlay))).toEqual({ type: "showInfo" });
    });

    it("selects in the guide", () => {
      expect(map({ key: "Enter" }, state("guide"))).toEqual({ type: "guideSelect" });
    });

    it("picks the option in the exit confirmation", () => {
      expect(map({ key: "Enter" }, state("exitConfirm"))).toEqual({ type: "exitSelect" });
    });
  });

  describe("Back", () => {
    it.each(["Escape", "GoBack"])("maps %s to back, with or without an overlay", (key) => {
      for (const overlay of ["none", "info", "guide", "exitConfirm"] as const) {
        expect(map({ key }, state(overlay))).toEqual({ type: "back" });
      }
    });
  });

  describe("exit confirmation", () => {
    it.each(["ArrowLeft", "ArrowRight"])("moves the choice with %s", (key) => {
      expect(map({ key }, state("exitConfirm"))).toEqual({ type: "exitMove" });
    });

    it("ignores arrows elsewhere for now", () => {
      expect(map({ key: "ArrowLeft" }, state("none"))).toEqual({ type: "none" });
    });
  });

  describe("zapping", () => {
    it.each(["none", "info"] as const)("works with overlay %s", (overlay) => {
      for (const key of ["ArrowUp", "ChannelUp", "PageUp"]) {
        expect(map({ key }, state(overlay))).toEqual({ type: "channelUp" });
      }
      for (const key of ["ArrowDown", "ChannelDown", "PageDown"]) {
        expect(map({ key }, state(overlay))).toEqual({ type: "channelDown" });
      }
    });

    it.each(["guide", "exitConfirm"] as const)("is left to the %s overlay", (overlay) => {
      for (const key of ["ArrowUp", "ArrowDown", "ChannelUp", "ChannelDown"]) {
        expect(map({ key }, state(overlay))).toEqual({ type: "none" });
      }
    });
  });

  describe("skip (ArrowRight)", () => {
    it.each(["none", "info"] as const)("skips in queue mode with overlay %s", (overlay) => {
      expect(map({ key: "ArrowRight" }, state(overlay))).toEqual({ type: "skip" });
    });

    it("reports a blocked skip in live mode", () => {
      expect(map({ key: "ArrowRight" }, { overlay: "none", mode: "live" })).toEqual({ type: "skipBlocked" });
    });
  });

  // The guide arrives with #9.
  it.each(["a"])("maps %s to none", (key) => {
    expect(map({ key }, state("none"))).toEqual({ type: "none" });
  });

  describe("mode toggle", () => {
    it.each(["m", "M", "ContextMenu", "ColorF2Yellow"])("toggles with %s", (key) => {
      for (const overlay of ["none", "info"] as const) {
        expect(map({ key }, state(overlay))).toEqual({ type: "toggleMode" });
      }
    });

    it.each(["guide", "exitConfirm"] as const)("is ignored with overlay %s", (overlay) => {
      expect(map({ key: "m" }, state(overlay))).toEqual({ type: "none" });
    });
  });
});
