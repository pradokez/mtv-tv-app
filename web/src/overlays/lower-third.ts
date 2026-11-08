import type { VideoSnapshot } from "../catalog/schema";

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
