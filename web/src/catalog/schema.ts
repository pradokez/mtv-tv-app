/**
 * Catalog snapshot format, version 1. See `web/docs/catalog-schema.md`.
 *
 * The snapshot is produced by the Catalog Builder and read by the app. Any
 * breaking change to this shape must bump `CATALOG_SCHEMA_VERSION`.
 */
export const CATALOG_SCHEMA_VERSION = 1;

export interface CatalogSnapshotV1 {
  schemaVersion: 1;
  /** ISO 8601 timestamp of when the snapshot was built. Informative only. */
  generatedAt?: string;
  channels: ChannelSnapshot[];
  /** Video metadata keyed by YouTube video id. */
  videos: Record<string, VideoSnapshot>;
}

export interface ChannelSnapshot {
  id: string;
  name: string;
  /** Relative path or URL of the channel icon. */
  icon: string;
  /** Position in the channel list (ascending). */
  order: number;
  /** YouTube video ids, in playlist order. Each must exist in `videos`. */
  videoIds: string[];
}

export interface VideoSnapshot {
  durationSec?: number;
  artist?: string;
  song?: string;
  /** Original YouTube title, used when artist or song is missing. */
  title?: string;
}
