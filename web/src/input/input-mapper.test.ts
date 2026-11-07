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

  // Zapping and the guide arrive with #5 and #9.
  it.each(["ArrowUp", "ChannelUp", "a"])("maps %s to none for now", (key) => {
    expect(map({ key }, state("none"))).toEqual({ type: "none" });
  });
});
