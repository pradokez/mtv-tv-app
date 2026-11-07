import { describe, expect, it } from "vitest";
import type { UiState } from "./commands";
import { map } from "./input-mapper";

const idle: UiState = { overlay: "none", mode: "queue" };

describe("map", () => {
  // No key is mapped yet: the mapping table arrives with zapping, the lower
  // third and the guide (#5, #6, #9).
  it.each(["ArrowUp", "ArrowLeft", "Enter", "ChannelUp", "Escape", "a"])(
    "maps %s to none for now",
    (key) => {
      expect(map({ key }, idle)).toEqual({ type: "none" });
    },
  );
});
