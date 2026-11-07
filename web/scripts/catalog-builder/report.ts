import type { BuildReport } from "./build.ts";

const count = (n: number) => n.toLocaleString("pt-BR");
const oneDecimal = { minimumFractionDigits: 1, maximumFractionDigits: 1 };

/** The build report as text for the terminal. */
export function formatReport(report: BuildReport): string {
  const percent = (n: number) =>
    `${(report.videos ? (n / report.videos) * 100 : 0).toLocaleString("pt-BR", oneDecimal)}%`;
  const lines = [
    `Canais: ${count(report.channels)}`,
    `Vídeos: ${count(report.videos)}`,
    `Descartados:`,
    ...(report.droppedChannels.length
      ? report.droppedChannels.map((c) => `  canal ${c.id} (${c.reason})`)
      : ["  nenhum canal"]),
    `  IDs inválidos: ${count(report.invalidIds)}`,
    `  IDs repetidos no mesmo canal: ${count(report.duplicateIds)}`,
    `Metadados da tarja:`,
    `  artista + música: ${count(report.metadata.artistAndSong)} (${percent(report.metadata.artistAndSong)})`,
    `  só título original: ${count(report.metadata.titleOnly)} (${percent(report.metadata.titleOnly)})`,
    `  sem metadado: ${count(report.metadata.none)} (${percent(report.metadata.none)})`,
  ];
  if (report.warnings.length) lines.push("Avisos:", ...report.warnings.map((w) => `  ${w}`));
  return lines.join("\n");
}
