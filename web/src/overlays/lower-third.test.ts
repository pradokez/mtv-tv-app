import { describe, expect, it } from "vitest";
import { lowerThirdLines } from "./lower-third";

describe("lowerThirdLines", () => {
  it("shows artist, quoted song and channel", () => {
    expect(lowerThirdLines({ artist: "a-ha", song: "Take On Me", title: "x" }, "Anos 80", 7)).toEqual([
      "a-ha",
      "“Take On Me”",
      "07 · Anos 80",
    ]);
  });

  it("falls back to the original title when artist or song is missing", () => {
    expect(lowerThirdLines({ artist: "a-ha", title: "Raw Title" }, "Anos 80", 7)).toEqual(["Raw Title", "07 · Anos 80"]);
    expect(lowerThirdLines({ song: "S", title: "Raw Title" }, "Anos 80", 7)).toEqual(["Raw Title", "07 · Anos 80"]);
  });

  it("shows only the channel without any metadata", () => {
    expect(lowerThirdLines({}, "Anos 80", 7)).toEqual(["07 · Anos 80"]);
    expect(lowerThirdLines(undefined, "Anos 80", 7)).toEqual(["07 · Anos 80"]);
  });

  it("does not cut channel numbers above 99", () => {
    expect(lowerThirdLines(undefined, "Rock", 113)).toEqual(["113 · Rock"]);
  });
});
