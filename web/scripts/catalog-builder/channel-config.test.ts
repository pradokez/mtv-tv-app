import { describe, expect, it } from "vitest";
import { parseChannelConfig } from "./channel-config.ts";

// Trimmed copy of the site's channel configuration script, keeping the shapes
// that matter: quoting styles, an inline SVG icon and the non-data members.
const configJs = `
// CHANNEL CONFIGURATION
window.CHANNEL_CONFIG = {
    info: {
        '1stday': { name: 'MTV 1st Day', icon: '📺' },
        'sixtysongs90s': { name: "60 SONGS THAT EXPLAIN THE '90S", icon: '🎙️' },
        'eurovision': { name: 'EUROVISION 2026', icon: '<svg viewBox="0 0 100 100"><path d="M50 82 C 30 65 Z"/></svg>' },
        'rock': { name: 'Rock \\'n\\' Roll', icon: '🎸' },
        '80s': { name: "80's", icon: '📼' },
    },

    descriptions: {
        '1stday': 'The first videos { ever } played',
    },

    sections: {
        'curated': {
            name: '🎬 CURATED COLLECTIONS',
            channels: ['1stday', 'sixtysongs90s', 'eurovision']
        },
        'decades': {
            name: '📅 BY DECADE',
            channels: ['80s']
        }
    },

    shuffleExclusions: new Set(),
    initShufflePreferences: function() {
        const saved = localStorage.getItem('x');
        if (saved) { this.shuffleExclusions = new Set(JSON.parse(saved)); }
    },
};
`;

describe("parseChannelConfig", () => {
  it("reads each channel's name and icon", () => {
    const config = parseChannelConfig(configJs);

    expect(config.info["1stday"]).toEqual({ name: "MTV 1st Day", icon: "📺" });
    expect(config.info["80s"]).toEqual({ name: "80's", icon: "📼" });
  });

  it("keeps quotes and escapes inside names and icons as text", () => {
    const config = parseChannelConfig(configJs);

    expect(config.info.sixtysongs90s?.name).toBe("60 SONGS THAT EXPLAIN THE '90S");
    expect(config.info.rock?.name).toBe("Rock 'n' Roll");
    expect(config.info.eurovision?.icon).toMatch(/^<svg viewBox="0 0 100 100">.*<\/svg>$/);
  });

  it("lists the sections in the site's order with their channels", () => {
    const config = parseChannelConfig(configJs);

    expect(config.sections).toEqual([
      { id: "curated", channels: ["1stday", "sixtysongs90s", "eurovision"] },
      { id: "decades", channels: ["80s"] },
    ]);
  });

  it("fails with a clear message when the format changes", () => {
    expect(() => parseChannelConfig("window.CHANNEL_CONFIG = { sections: {} };")).toThrow(
      "não achei `info` na configuração de canais",
    );
    expect(() => parseChannelConfig("x = { info: { a: { name: 'A' } }, sections: {} }")).toThrow("`info.a.icon`");
    expect(() => parseChannelConfig("x = { info: {}, sections: {} }")).toThrow("nenhum canal");
  });
});
