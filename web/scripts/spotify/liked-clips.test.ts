import { describe, expect, it } from "vitest";
import { LikedClipsError, parseLikedClips, toLikedClips } from "./liked-clips.ts";

const clip = (fields = {}) => ({ id: "xKCek6_dB0M", artist: "Nirvana", song: "Lithium", year: 1991, genres: ["grunge"], ...fields });

describe("parseLikedClips", () => {
  it("reads the clips", () => {
    expect(parseLikedClips(JSON.stringify({ clips: [clip(), clip({ year: undefined, id: "Jb2stN7kH28" })] }))).toHaveLength(2);
  });

  it("rejects bad files naming the position", () => {
    expect(() => parseLikedClips("{")).toThrow(LikedClipsError);
    expect(() => parseLikedClips("[]")).toThrow(/clips/);
    expect(() => parseLikedClips(JSON.stringify({ clips: [clip(), clip({ genres: "grunge" })] }))).toThrow(/posição 1.*genres/);
    expect(() => parseLikedClips(JSON.stringify({ clips: [clip({ year: "1991" })] }))).toThrow(/posição 0.*year/);
  });
});

describe("toLikedClips", () => {
  it("resolves each clip's channels with the rules", () => {
    const rules = [{ channel: "grunge", genres: ["grunge"] }];

    expect(toLikedClips([clip(), clip({ id: "Jb2stN7kH28", year: undefined, genres: [] })], rules)).toEqual([
      { id: "xKCek6_dB0M", artist: "Nirvana", song: "Lithium", channels: ["90s", "grunge"] },
      { id: "Jb2stN7kH28", artist: "Nirvana", song: "Lithium", channels: [] },
    ]);
  });
});
