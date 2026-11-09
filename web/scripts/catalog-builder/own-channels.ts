/**
 * The hand-curated channels (`web/curadoria/canais-proprios.json`): channels
 * that do not exist on the site, with their own clips and their own artist and
 * song for the lower third. The Catalog Builder reads them, checks duration
 * and embed status like any other video, and adds them to the snapshot.
 */

import { YOUTUBE_ID } from "./build.ts";

export interface OwnChannelVideo {
  /** YouTube video id. */
  id: string;
  artist: string;
  song: string;
}

export interface OwnChannel {
  id: string;
  name: string;
  icon: string;
  /** The channel goes right after the last channel of this site section (end of the list when absent or unknown). */
  afterSection?: string;
  videos: OwnChannelVideo[];
}

export class OwnChannelsError extends Error {
  override name = "OwnChannelsError";
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Parses the curated file's text. The order of the file is kept. */
export function parseOwnChannels(text: string): OwnChannel[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new OwnChannelsError("a curadoria de canais próprios não é um JSON válido");
  }
  const list = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as { channels?: unknown }).channels : undefined;
  if (list === undefined) throw new OwnChannelsError('a curadoria deveria ser { "channels": [...] }');
  if (!Array.isArray(list)) throw new OwnChannelsError("`channels` deveria ser uma lista");

  const seenChannels = new Set<string>();
  return list.map((raw: unknown, index) => {
    const c = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const where = `canal na posição ${index}`;
    if (!isText(c.id) || !isText(c.name) || !isText(c.icon)) throw new OwnChannelsError(`${where} inválido (esperava id, name, icon e videos)`);
    if (c.afterSection !== undefined && !isText(c.afterSection)) throw new OwnChannelsError(`${where}: afterSection deveria ser um texto`);
    if (!Array.isArray(c.videos)) throw new OwnChannelsError(`${where}: \`videos\` deveria ser uma lista`);
    if (seenChannels.has(c.id)) throw new OwnChannelsError(`${where}: ID de canal repetido (${c.id})`);
    seenChannels.add(c.id);

    const seenVideos = new Set<string>();
    const videos = c.videos.map((rawVideo: unknown, i): OwnChannelVideo => {
      const v = typeof rawVideo === "object" && rawVideo !== null ? (rawVideo as Record<string, unknown>) : {};
      const videoWhere = `${where} (${c.id}), vídeo na posição ${i}`;
      if (typeof v.id !== "string" || !YOUTUBE_ID.test(v.id)) throw new OwnChannelsError(`${videoWhere}: ID do YouTube inválido`);
      if (!isText(v.artist) || !isText(v.song)) throw new OwnChannelsError(`${videoWhere} inválido (esperava id, artist e song)`);
      if (seenVideos.has(v.id)) throw new OwnChannelsError(`${videoWhere}: ID repetido (${v.id})`);
      seenVideos.add(v.id);
      return { id: v.id, artist: v.artist, song: v.song };
    });
    return { id: c.id, name: c.name, icon: c.icon, ...(c.afterSection ? { afterSection: c.afterSection } : {}), videos };
  });
}
