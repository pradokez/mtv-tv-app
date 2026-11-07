import type { VideoSnapshot } from "../catalog/schema";

/**
 * Lines of the lower third, one piece of information per line: artist, “song”,
 * channel. Without artist or song it falls back to the original YouTube title;
 * without any metadata only the channel is shown.
 */
export function lowerThirdLines(video: VideoSnapshot | undefined, channelName: string): string[] {
  if (video?.artist && video.song) return [video.artist, `“${video.song}”`, channelName];
  if (video?.title) return [video.title, channelName];
  return [channelName];
}
