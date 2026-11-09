import {
  CATALOG_SCHEMA_VERSION,
  type CatalogSnapshotV1,
  type ChannelSnapshot,
  type CommercialSnapshot,
  type VideoSnapshot,
} from "../../src/catalog/schema.ts";
import type { ChannelConfig, ChannelInfo } from "./channel-config.ts";
import type { CuratedCommercial } from "./commercials.ts";
import type { OwnChannel } from "./own-channels.ts";

/** One entry of the site's search index. `y` is the upload year and is never used. */
export interface SearchEntry {
  id: string;
  /** Artist. */
  a?: string;
  /** Song. */
  s?: string;
  /** Original YouTube title. */
  t?: string;
  y?: string;
}

/** Why a video is left out of the snapshot: the TV could never play it. */
export const DISCARD_REASONS = ["privado ou removido", "não embutível", "sem duração"] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];

/** What the metadata source knows about one video: its duration, or why it must go. */
export type VideoLookup = { durationSec: number } | { discard: DiscardReason };

export interface MetaLookupResult {
  /** Ids missing here are kept, without extra metadata. */
  found: ReadonlyMap<string, VideoLookup>;
  /** API quota spent by this run. */
  quotaUnits: number;
}

/** Extra metadata per video id (e.g. duration from the YouTube Data API). */
export type MetaLookup = (ids: readonly string[]) => Promise<MetaLookupResult>;

/** Fetches no extra metadata: every video is kept, without duration. */
export const noMetaLookup: MetaLookup = async () => ({ found: new Map(), quotaUnits: 0 });

export interface BuildInput {
  /** Channel id → YouTube video ids, as published by the site. */
  playlists: Record<string, string[]>;
  channelConfig: ChannelConfig;
  searchIndex: readonly SearchEntry[];
  metaLookup: MetaLookup;
  generatedAt: string;
  /** The hand-curated commercials. Without them the snapshot has no breaks. */
  commercials?: readonly CuratedCommercial[];
  /** The hand-curated channels, added to the site's. Their artist and song win over the search index. */
  ownChannels?: readonly OwnChannel[];
}

export interface DroppedChannel {
  id: string;
  reason: "sem configuração" | "vazio";
}

export interface BuildReport {
  /** Channels in the snapshot. */
  channels: number;
  /** Distinct videos in the snapshot. */
  videos: number;
  droppedChannels: DroppedChannel[];
  /** Ids that are not 11-character YouTube ids. */
  invalidIds: number;
  /** Repeats of an id within the same channel. */
  duplicateIds: number;
  /** Distinct videos left out because the TV could not play them. */
  discardedVideos: Record<DiscardReason, number>;
  /** What the overlay will have to show, per video. */
  metadata: { artistAndSong: number; titleOnly: number; none: number };
  /** YouTube Data API quota spent by this run (cached answers cost nothing). */
  quotaUnits: number;
  /** The curated commercials: kept in the snapshot, or left out because the TV could not play them. */
  commercials: { kept: number; discarded: Record<DiscardReason, number> };
  warnings: string[];
}

export interface BuildResult {
  catalog: CatalogSnapshotV1;
  report: BuildReport;
}

/** A commercial longer than this is probably a compilation, not a single spot. */
const LONG_COMMERCIAL_SEC = 90;

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Our channel order (not the site's): decades first, like flipping through
 * MTV. Sections the site adds later go after these, in the site's order.
 */
export const SECTION_ORDER = ["decades", "shows", "curated", "regional", "other", "labels", "directors"];

/** HTML icons (e.g. an inline SVG) are never copied into the catalog. */
const HTML_ICON_REPLACEMENT = "💜";

export async function build(input: BuildInput): Promise<BuildResult> {
  const report: BuildReport = {
    channels: 0,
    videos: 0,
    droppedChannels: [],
    invalidIds: 0,
    duplicateIds: 0,
    discardedVideos: Object.fromEntries(DISCARD_REASONS.map((r) => [r, 0])) as Record<DiscardReason, number>,
    metadata: { artistAndSong: 0, titleOnly: 0, none: 0 },
    quotaUnits: 0,
    commercials: {
      kept: 0,
      discarded: Object.fromEntries(DISCARD_REASONS.map((r) => [r, 0])) as Record<DiscardReason, number>,
    },
    warnings: [],
  };

  const candidates: { id: string; info: ChannelInfo; videoIds: string[] }[] = [];
  const ownMeta = new Map<string, VideoSnapshot>();
  for (const [id, playlist] of byChannelOrder(input.playlists, input.channelConfig)) {
    const info = input.channelConfig.info[id];
    if (!info) {
      report.droppedChannels.push({ id, reason: "sem configuração" });
      continue;
    }
    const videoIds = new Set<string>();
    for (const raw of playlist) {
      const videoId = raw.trim();
      if (!YOUTUBE_ID.test(videoId)) report.invalidIds++;
      else if (videoIds.has(videoId)) report.duplicateIds++;
      else videoIds.add(videoId);
    }
    if (videoIds.size === 0) {
      report.droppedChannels.push({ id, reason: "vazio" });
      continue;
    }
    candidates.push({ id, info, videoIds: [...videoIds] });
  }

  addOwnChannels(candidates, ownMeta, input.ownChannels ?? [], input.channelConfig, report);

  const clipIds = new Set(candidates.flatMap((c) => c.videoIds));
  const curated = input.commercials ?? [];
  // One lookup for clips and commercials: same cache, same batches.
  const extra = await input.metaLookup([...new Set([...clipIds, ...curated.map((c) => c.id)])]);
  report.quotaUnits = extra.quotaUnits;
  const discarded = new Set<string>();
  for (const [id, lookup] of extra.found) {
    if (clipIds.has(id) && "discard" in lookup) {
      discarded.add(id);
      report.discardedVideos[lookup.discard]++;
    }
  }

  const channels: ChannelSnapshot[] = [];
  for (const { id, info, videoIds } of candidates) {
    const kept = videoIds.filter((videoId) => !discarded.has(videoId));
    if (kept.length === 0) {
      report.droppedChannels.push({ id, reason: "vazio" });
      continue;
    }
    let icon = info.icon;
    if (icon.trimStart().startsWith("<")) {
      icon = HTML_ICON_REPLACEMENT;
      report.warnings.push(`canal ${id}: ícone em HTML trocado por ${HTML_ICON_REPLACEMENT}`);
    }
    channels.push({ id, name: info.name, icon, order: channels.length, videoIds: kept });
  }

  const ids = [...new Set(channels.flatMap((c) => c.videoIds))];
  const index = new Map(input.searchIndex.map((e) => [e.id, e]));
  const videos: Record<string, VideoSnapshot> = {};
  for (const id of ids) {
    const meta = ownMeta.get(id) ?? displayMeta(index.get(id));
    if (meta.artist) report.metadata.artistAndSong++;
    else if (meta.title) report.metadata.titleOnly++;
    else report.metadata.none++;
    const lookup = extra.found.get(id);
    videos[id] = lookup && "durationSec" in lookup ? { ...meta, durationSec: lookup.durationSec } : meta;
  }

  const commercials = keepPlayableCommercials(curated, extra.found, report);

  report.channels = channels.length;
  report.videos = ids.length;
  return {
    catalog: {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      generatedAt: input.generatedAt,
      channels,
      videos,
      ...(input.commercials ? { commercials } : {}),
    },
    report,
  };
}

/**
 * Puts the curated channels into `candidates`: right after the last channel of
 * their `afterSection` (end of the list when the section is absent). A channel
 * whose id the site already uses is skipped with a warning.
 */
function addOwnChannels(
  candidates: { id: string; info: ChannelInfo; videoIds: string[] }[],
  ownMeta: Map<string, VideoSnapshot>,
  own: readonly OwnChannel[],
  config: ChannelConfig,
  report: BuildReport,
): void {
  for (const channel of own) {
    if (candidates.some((c) => c.id === channel.id)) {
      report.warnings.push(`canal próprio ${channel.id}: o site já tem um canal com esse ID, o próprio foi ignorado`);
      continue;
    }
    const sectionIds = new Set(config.sections.find((s) => s.id === channel.afterSection)?.channels);
    const lastOfSection = candidates.map((c) => sectionIds.has(c.id)).lastIndexOf(true);
    const entry = { id: channel.id, info: { name: channel.name, icon: channel.icon }, videoIds: channel.videos.map((v) => v.id) };
    candidates.splice(lastOfSection === -1 ? candidates.length : lastOfSection + 1, 0, entry);
    for (const { id, artist, song } of channel.videos) ownMeta.set(id, { artist, song });
  }
}

/** A commercial needs a known duration (the live grid is built on it), so one the lookup never answered is dropped. */
function keepPlayableCommercials(
  curated: readonly CuratedCommercial[],
  found: ReadonlyMap<string, VideoLookup>,
  report: BuildReport,
): CommercialSnapshot[] {
  const kept: CommercialSnapshot[] = [];
  for (const commercial of curated) {
    const lookup = found.get(commercial.id);
    if (lookup && "durationSec" in lookup) {
      kept.push({ ...commercial, durationSec: lookup.durationSec });
      if (lookup.durationSec > LONG_COMMERCIAL_SEC) {
        report.warnings.push(`comercial ${commercial.id} (${commercial.brand}) dura ${lookup.durationSec}s: pode ser uma coletânea`);
      }
    } else {
      report.commercials.discarded[lookup ? lookup.discard : "sem duração"]++;
    }
  }
  report.commercials.kept = kept.length;
  return kept;
}

/** Playlists sorted by section (see `SECTION_ORDER`); unsectioned channels last, in playlist order. */
function byChannelOrder(playlists: BuildInput["playlists"], config: ChannelConfig): [string, string[]][] {
  const rankOf = (sectionId: string) => {
    const rank = SECTION_ORDER.indexOf(sectionId);
    return rank === -1 ? SECTION_ORDER.length : rank;
  };
  const sections = [...config.sections].sort((a, b) => rankOf(a.id) - rankOf(b.id));
  const position = new Map<string, number>();
  for (const channelId of sections.flatMap((s) => s.channels)) {
    if (!position.has(channelId)) position.set(channelId, position.size);
  }
  const unsectioned = position.size;
  return Object.entries(playlists)
    .map((entry, index) => ({ entry, rank: position.get(entry[0]) ?? unsectioned + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ entry }) => entry);
}

/** Artist and song when both exist; otherwise the original title; otherwise nothing. */
function displayMeta(entry: SearchEntry | undefined): VideoSnapshot {
  const artist = entry?.a?.trim();
  const song = entry?.s?.trim();
  if (artist && song) return { artist, song };
  const title = entry?.t?.trim();
  return title ? { title } : {};
}
