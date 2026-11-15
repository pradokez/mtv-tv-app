/**
 * Picks the official music video for a song among YouTube search results.
 * Audio-only uploads (auto-generated "- Topic" channels, "official audio",
 * lyric videos, visualizers) never qualify: only real clips are wanted.
 */

export interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
}

export interface WantedSong {
  artist: string;
  song: string;
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Words only, without what is in parentheses or brackets ("(feat. X)", "[Remastered]"). */
const normalize = (text: string) =>
  fold(text)
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\s+-\s+(?:remaster(?:ed)?|\d{4}.*|single version|radio edit).*$/u, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Words only, keeping what is in parentheses: that is where "(Official Audio)" and "(Remix)" are. */
const words = (text: string) => fold(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Words that mark an upload as something other than the clip. */
const NOT_A_CLIP = /\b(?:audio|lyrics?|lyric video|letra|legendado|traduc\w*|visuali[sz]er|karaoke|instrumental|slowed|sped up|reverb|nightcore|8d|cover|reaction|tutorial|live|ao vivo|acoustic)\b/;
const IS_A_CLIP = /\b(?:official (?:music )?video|official mv|video oficial|videoclipe|video clipe|clipe oficial|music video)\b|\bm v\b/;

/** Variants of the song ("remix", "live") only count when the wanted song is one too. */
const VARIANT = /\b(?:remix|mix|edit|version|live|ao vivo)\b/;

const hasWords = (haystack: string, needle: string) => needle !== "" && ` ${haystack} `.includes(` ${needle} `);

/** Score of a result for a song; null when it can never be the clip. */
export function scoreResult(result: SearchResult, wanted: WantedSong): number | null {
  const title = normalize(result.title);
  const channel = normalize(result.channelTitle);
  const artist = normalize(wanted.artist);
  const song = normalize(wanted.song);

  if (channel.endsWith(" topic")) return null;
  if (!hasWords(title, song)) return null;
  // The song's own words ("Cover Me", "Live Forever") must not count as marks of another kind of upload.
  const fullSong = words(wanted.song);
  const rest = words(result.title).replace(fullSong, " ").replace(song, " ");
  if (NOT_A_CLIP.test(rest) && !NOT_A_CLIP.test(fullSong)) return null;
  if (VARIANT.test(rest) && !VARIANT.test(fullSong)) return null;

  let score = 0;
  if (hasWords(title, artist) || hasWords(channel, artist) || channel.includes("vevo")) score += 3;
  else return null; // song title matches but neither the title nor the channel names the artist
  if (IS_A_CLIP.test(title)) score += 3;
  if (channel.includes("vevo") || hasWords(channel, artist)) score += 2; // the artist's own or VEVO channel
  return score;
}

/** The best result for the song, or undefined when none is a clip of it. */
export function pickClip(results: readonly SearchResult[], wanted: WantedSong): SearchResult | undefined {
  let best: { result: SearchResult; score: number } | undefined;
  for (const result of results) {
    const score = scoreResult(result, wanted);
    // A clear sign it is a clip is required: a title match alone could be anything.
    if (score === null || score < 5) continue;
    if (!best || score > best.score) best = { result, score };
  }
  return best?.result;
}
