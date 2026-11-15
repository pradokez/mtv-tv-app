import { describe, expect, it } from "vitest";
import { pickClip, type SearchResult } from "./clip-match.ts";

const r = (videoId: string, title: string, channelTitle: string): SearchResult => ({ videoId, title, channelTitle });
const aha = { artist: "a-ha", song: "Take On Me" };

describe("pickClip", () => {
  it("picks the official video over audio-only uploads", () => {
    const results = [
      r("audio000001", "a-ha - Take On Me (Official Audio)", "a-ha"),
      r("topic000001", "Take On Me", "a-ha - Topic"),
      r("lyric000001", "a-ha - Take On Me (Lyrics)", "Some Lyrics"),
      r("clip0000001", "a-ha - Take On Me (Official Video) [4K]", "a-ha"),
    ];

    expect(pickClip(results, aha)?.videoId).toBe("clip0000001");
  });

  it("accepts a plain 'Artist - Song' upload from the artist's own or VEVO channel", () => {
    expect(pickClip([r("vevo0000001", "Rihanna - Umbrella ft. JAY-Z", "RihannaVEVO")], { artist: "Rihanna", song: "Umbrella" })?.videoId).toBe("vevo0000001");
  });

  it("rejects the same plain title on a random channel", () => {
    expect(pickClip([r("rand0000001", "a-ha - Take On Me", "Random Uploads")], aha)).toBeUndefined();
  });

  it("rejects remixes, covers and lives unless the song itself is one", () => {
    expect(pickClip([r("remix000001", "a-ha - Take On Me (Remix) Official Video", "a-ha")], aha)).toBeUndefined();
    expect(pickClip([r("cover000001", "Take On Me cover - a-ha", "Someone")], aha)).toBeUndefined();
    expect(pickClip([r("live0000001", "a-ha - Take On Me (Live) Official Video", "a-ha")], aha)).toBeUndefined();
    expect(pickClip([r("rmx00000001", "Song X (Remix) - Artist Official Video", "ArtistVEVO")], { artist: "Artist", song: "Song X (Remix)" })?.videoId).toBe("rmx00000001");
  });

  it("does not take the song's own words as marks of another upload", () => {
    expect(pickClip([r("cvr00000001", "Artist - Cover Me (Official Video)", "Artist")], { artist: "Artist", song: "Cover Me" })?.videoId).toBe("cvr00000001");
  });

  it("matches ignoring accents, case and feat. credits", () => {
    expect(pickClip([r("acc00000001", "Anitta - Envolver (Official Music Video)", "Anitta")], { artist: "Anitta", song: "Envolver (feat. X)" })?.videoId).toBe("acc00000001");
    expect(pickClip([r("cafe0000001", "Beyoncé - Halo (Official Video)", "BeyoncéVEVO")], { artist: "Beyonce", song: "HALO" })?.videoId).toBe("cafe0000001");
  });

  it("returns undefined when nothing is a clip of the song", () => {
    expect(pickClip([], aha)).toBeUndefined();
    expect(pickClip([r("other000001", "a-ha - Hunting High and Low (Official Video)", "a-ha")], aha)).toBeUndefined();
  });
});
