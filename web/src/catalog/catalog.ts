import {
  CATALOG_SCHEMA_VERSION,
  type ChannelSnapshot,
  type CommercialSnapshot,
  type VideoSnapshot,
} from "./schema";

export interface Catalog {
  /** Playable channels, sorted by `order`. Channels with no known video are omitted. */
  channels(): readonly ChannelSnapshot[];
  channel(id: string): ChannelSnapshot | undefined;
  video(id: string): VideoSnapshot | undefined;
  /** Commercials for the breaks between clips, in snapshot order. Never channels. */
  commercials(): readonly CommercialSnapshot[];
  commercial(id: string): CommercialSnapshot | undefined;
}

/** The snapshot can't be used by this version of the app. */
export class CatalogError extends Error {
  override name = "CatalogError";
}

/**
 * Validates a snapshot (already JSON-parsed) and builds the query interface.
 * Throws `CatalogError` when the schema version is incompatible or the shape
 * is malformed. Video ids without metadata are dropped from their channel.
 */
export function parseCatalog(input: unknown): Catalog {
  const version = isRecord(input) ? input.schemaVersion : undefined;
  if (version === undefined) {
    throw new CatalogError(
      `Catálogo sem versão de esquema; este app entende v${CATALOG_SCHEMA_VERSION}`,
    );
  }
  if (version !== CATALOG_SCHEMA_VERSION) {
    throw new CatalogError(
      `Catálogo com esquema v${String(version)}; este app entende v${CATALOG_SCHEMA_VERSION}`,
    );
  }
  const snapshot = input as Record<string, unknown>;
  if (!isRecord(snapshot.videos)) throw malformed("`videos` deve ser um objeto");
  if (!Array.isArray(snapshot.channels)) throw malformed("`channels` deve ser uma lista");

  const videosById = new Map(Object.entries(snapshot.videos as Record<string, VideoSnapshot>));
  const channels = snapshot.channels
    .map((raw, index) => toChannel(raw, index))
    .map((c) => ({ ...c, videoIds: c.videoIds.filter((id) => videosById.has(id)) }))
    .filter((c) => c.videoIds.length > 0)
    .sort((a, b) => a.order - b.order);
  const channelsById = new Map(channels.map((c) => [c.id, c]));
  const commercials = toCommercials(snapshot.commercials);
  const commercialsById = new Map(commercials.map((c) => [c.id, c]));

  return {
    channels: () => channels,
    channel: (id) => channelsById.get(id),
    video: (id) => videosById.get(id),
    commercials: () => commercials,
    commercial: (id) => commercialsById.get(id),
  };
}

/** Absent means no breaks; a repeated id keeps its first entry. */
function toCommercials(raw: unknown): CommercialSnapshot[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw malformed("`commercials` deve ser uma lista");
  const seen = new Set<string>();
  const list: CommercialSnapshot[] = [];
  raw.forEach((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.brand !== "string" ||
      typeof entry.title !== "string" ||
      (entry.year !== null && typeof entry.year !== "number") ||
      typeof entry.durationSec !== "number" ||
      !Number.isFinite(entry.durationSec) ||
      entry.durationSec <= 0
    ) {
      throw malformed(`comercial na posição ${index} inválido`);
    }
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    list.push({ id: entry.id, brand: entry.brand, title: entry.title, year: entry.year, durationSec: entry.durationSec });
  });
  return list;
}

function toChannel(raw: unknown, index: number): ChannelSnapshot {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.icon !== "string" ||
    typeof raw.order !== "number" ||
    !Array.isArray(raw.videoIds) ||
    !raw.videoIds.every((id) => typeof id === "string")
  ) {
    throw malformed(`canal na posição ${index} inválido`);
  }
  return {
    id: raw.id,
    name: raw.name,
    icon: raw.icon,
    order: raw.order,
    videoIds: raw.videoIds as string[],
  };
}

function malformed(detail: string): CatalogError {
  return new CatalogError(`Catálogo malformado: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
