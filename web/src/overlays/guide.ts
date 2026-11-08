import type { ChannelSnapshot } from "../catalog/schema";
import type { PlaybackMode } from "../preferences/preferences";

/** One line of the guide: a setting (playback mode, favorites-only switch), or a channel. */
export type GuideRow =
  | { kind: "mode"; mode: PlaybackMode }
  | { kind: "filter"; on: boolean; /** On, but with no favorites to restrict to. */ ignored: boolean }
  | { kind: "channel"; id: string; name: string; icon: string; favorite: boolean };

/**
 * Rows of the guide: the settings first, then the favorites (in catalog order),
 * then the other channels, each channel appearing once.
 */
export function guideRows(
  channels: readonly ChannelSnapshot[],
  favorites: readonly string[],
  favoritesOnly: boolean,
  mode: PlaybackMode,
): GuideRow[] {
  const isFavorite = new Set(favorites);
  const row = (c: ChannelSnapshot): GuideRow => ({
    kind: "channel",
    id: c.id,
    name: c.name,
    icon: c.icon,
    favorite: isFavorite.has(c.id),
  });
  const favs = channels.filter((c) => isFavorite.has(c.id));
  const others = channels.filter((c) => !isFavorite.has(c.id));
  return [
    { kind: "mode", mode },
    { kind: "filter", on: favoritesOnly, ignored: favoritesOnly && favs.length === 0 },
    ...favs.map(row),
    ...others.map(row),
  ];
}

/** Title of the section that `row` opens, given the row above it; rows inside a section have none. */
export function guideSection(row: GuideRow, previous: GuideRow | undefined): string | undefined {
  if (row.kind !== "channel") return previous ? undefined : "// AJUSTES";
  if (previous?.kind === "channel" && previous.favorite === row.favorite) return undefined;
  return row.favorite ? "// FAVORITOS" : "// TODOS OS CANAIS";
}
