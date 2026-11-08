import type { ChannelSnapshot } from "../catalog/schema";

/** One line of the guide: the favorites-only switch, or a channel. */
export type GuideRow =
  | { kind: "filter"; on: boolean; /** On, but with no favorites to restrict to. */ ignored: boolean }
  | { kind: "channel"; id: string; name: string; icon: string; favorite: boolean };

/**
 * Rows of the guide: the favorites-only switch first, then the favorites (in
 * catalog order), then the other channels, each channel appearing once.
 */
export function guideRows(
  channels: readonly ChannelSnapshot[],
  favorites: readonly string[],
  favoritesOnly: boolean,
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
    { kind: "filter", on: favoritesOnly, ignored: favoritesOnly && favs.length === 0 },
    ...favs.map(row),
    ...others.map(row),
  ];
}
