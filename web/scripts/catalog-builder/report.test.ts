import { describe, expect, it } from "vitest";
import type { BuildReport } from "./build.ts";
import { formatReport } from "./report.ts";

const report: BuildReport = {
  channels: 2,
  videos: 1200,
  droppedChannels: [{ id: "thisday", reason: "vazio" }],
  invalidIds: 3,
  duplicateIds: 1,
  discardedVideos: { "privado ou removido": 1500, "não embutível": 12, "sem duração": 0 },
  metadata: { artistAndSong: 1000, titleOnly: 150, none: 50 },
  quotaUnits: 2150,
  commercials: { kept: 48, discarded: { "privado ou removido": 2, "não embutível": 1, "sem duração": 0 } },
  likedClips: { clips: 0, placements: 0, onlyAll: 0, noChannel: 0 },
  warnings: [],
};

describe("formatReport", () => {
  it("lists discarded videos by reason under the discards", () => {
    const text = formatReport(report);

    expect(text).toContain(
      [
        "  IDs repetidos no mesmo canal: 1",
        "  vídeos privados ou removidos: 1.500",
        "  vídeos não embutíveis: 12",
        "  vídeos sem duração: 0",
      ].join("\n"),
    );
  });

  it("shows the API quota used", () => {
    expect(formatReport(report)).toContain("Cota da API usada: 2.150 unidades");
    expect(formatReport({ ...report, quotaUnits: 1 })).toContain("Cota da API usada: 1 unidade");
  });

  it("counts only the videos kept as valid", () => {
    expect(formatReport(report)).toContain("Vídeos: 1.200");
  });

  it("reports the commercials kept and discarded", () => {
    expect(formatReport(report)).toContain(
      [
        "Comerciais:",
        "  mantidos: 48",
        "  privados ou removidos: 2",
        "  não embutíveis: 1",
        "  sem duração: 0",
      ].join("\n"),
    );
  });

  it("reports the liked clips only when there are some", () => {
    expect(formatReport(report)).not.toContain("Clipes das curtidas");
    expect(formatReport({ ...report, likedClips: { clips: 40, placements: 95, onlyAll: 6, noChannel: 2 } })).toContain(
      [
        "Clipes das curtidas:",
        "  adicionados: 40 (95 entradas em canais)",
        "  só no SHUFFLE ALL (nenhum canal combina): 6",
        "  fora do catálogo (nenhum canal combina e não há canal all): 2",
      ].join("\n"),
    );
  });
});
