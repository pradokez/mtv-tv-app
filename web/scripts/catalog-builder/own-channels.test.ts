import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OwnChannelsError, parseOwnChannels } from "./own-channels.ts";

const ID = "xKCek6_dB0M";
const video = (fields = {}) => ({ id: ID, artist: "Taylor Swift", song: "Teardrops On My Guitar", ...fields });
const channel = (fields = {}) => ({ id: "taylor-swift", name: "Taylor Swift", icon: "🦋", videos: [video()], ...fields });
const file = (...channels: unknown[]) => JSON.stringify({ channels });

describe("parseOwnChannels", () => {
  it("reads channels and videos, keeping the file order", () => {
    const other = "Jb2stN7kH28";

    const list = parseOwnChannels(file(channel({ afterSection: "decades", videos: [video(), video({ id: other, song: "Our Song" })] })));

    expect(list).toEqual([
      {
        id: "taylor-swift",
        name: "Taylor Swift",
        icon: "🦋",
        afterSection: "decades",
        videos: [video(), video({ id: other, song: "Our Song" })],
      },
    ]);
  });

  it("rejects a file that is not { channels: [...] }", () => {
    expect(() => parseOwnChannels("{")).toThrow(OwnChannelsError);
    expect(() => parseOwnChannels(JSON.stringify([]))).toThrow(/channels/);
    expect(() => parseOwnChannels(JSON.stringify({ channels: {} }))).toThrow(/lista/);
  });

  it("rejects an invalid channel, naming its position", () => {
    expect(() => parseOwnChannels(file(channel(), channel({ id: "outro", name: "" })))).toThrow(/posição 1/);
    expect(() => parseOwnChannels(file(channel({ videos: "x" })))).toThrow(/posição 0.*videos/);
    expect(() => parseOwnChannels(file(channel({ afterSection: 3 })))).toThrow(/afterSection/);
  });

  it("rejects a repeated channel id", () => {
    expect(() => parseOwnChannels(file(channel(), channel()))).toThrow(/posição 1.*repetido/);
  });

  it("rejects an invalid video, naming its position", () => {
    expect(() => parseOwnChannels(file(channel({ videos: [video(), video({ id: "curto" })] })))).toThrow(/vídeo na posição 1.*ID/);
    expect(() => parseOwnChannels(file(channel({ videos: [video({ song: "" })] })))).toThrow(/vídeo na posição 0/);
    expect(() => parseOwnChannels(file(channel({ videos: [video(), video()] })))).toThrow(/vídeo na posição 1.*repetido/);
  });

  it("accepts the committed curated file", () => {
    const text = readFileSync(new URL("../../curadoria/canais-proprios.json", import.meta.url), "utf8");

    const [taylor] = parseOwnChannels(text);

    expect(taylor).toMatchObject({ id: "taylor-swift", afterSection: "decades" });
    expect(taylor?.videos).toHaveLength(51);
  });
});
