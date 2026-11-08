import type { Catalog } from "../catalog/catalog";
import type { VideoSnapshot } from "../catalog/schema";
import type { LiveSchedule } from "../schedule/live-schedule";
import { COMMERCIAL_LABEL } from "./lower-third";

const UP_NEXT_LOOKAHEAD = 8;

/** What a guide row shows for a channel in live mode. */
export interface GuideOnAir {
  videoId: string;
  /** Label of the clip on air, or of the break;  `undefined` when the catalog has no metadata for it. */
  now: string | undefined;
  /** Label of the next clip (never a commercial); `undefined` when unknown or when it is the same clip again. */
  next: string | undefined;
  /** When the clip on air ends, i.e. when the row goes stale. */
  endsAtMs: number;
}

/** One-line label of a clip: “artist – song”, else the YouTube title, else nothing. */
export function clipLabel(video: VideoSnapshot | undefined): string | undefined {
  if (video?.artist && video.song) return `${video.artist} – ${video.song}`;
  return video?.title || undefined;
}

/** What is on air in `channelId` at `nowMs` according to the live grid, or `undefined` without a grid. */
export function guideOnAir(
  catalog: Catalog,
  schedule: LiveSchedule,
  channelId: string,
  nowMs: number,
): GuideOnAir | undefined {
  let onAir = schedule.whatsOn(channelId, nowMs, 1);
  if (!onAir) return undefined;
  // The next slot is a commercial: look far enough ahead to get past the break.
  if (onAir.upNext[0]?.kind === "commercial") onAir = schedule.whatsOn(channelId, nowMs, UP_NEXT_LOOKAHEAD)!;
  const upNext = onAir.upNext.find((slot) => slot.kind === "clip");
  return {
    videoId: onAir.videoId,
    now: onAir.kind === "commercial" ? COMMERCIAL_LABEL : clipLabel(catalog.video(onAir.videoId)),
    next: upNext && upNext.videoId !== onAir.videoId ? clipLabel(catalog.video(upNext.videoId)) : undefined,
    endsAtMs: onAir.endsAtMs,
  };
}
