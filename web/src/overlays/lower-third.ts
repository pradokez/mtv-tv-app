import type { CommercialSnapshot, VideoSnapshot } from "../catalog/schema";

/**
 * Lines of the lower third, one piece of information per line: artist, “song”,
 * channel (number and name). Without artist or song it falls back to the original YouTube title;
 * without any metadata only the channel is shown.
 */
export function lowerThirdLines(video: VideoSnapshot | undefined, channelName: string, channelNumber: number): string[] {
  const channel = `${String(channelNumber).padStart(2, "0")} · ${channelName}`;
  if (video?.artist && video.song) return [video.artist, `“${video.song}”`, channel];
  if (video?.title) return [video.title, channel];
  return [channel];
}

/** What the guide and the lower third say while a commercial break is on air. */
export const COMMERCIAL_LABEL = "Intervalo comercial";

/** Lower third of a commercial: the break, “brand · title · year”, then the channel. */
export function commercialLines(
  commercial: CommercialSnapshot | undefined,
  channelName: string,
  channelNumber: number,
): string[] {
  const channel = `${String(channelNumber).padStart(2, "0")} · ${channelName}`;
  if (!commercial) return [COMMERCIAL_LABEL, channel];
  const detail = [commercial.brand, commercial.title, commercial.year].filter((part) => part !== null).join(" · ");
  return [COMMERCIAL_LABEL, detail, channel];
}
