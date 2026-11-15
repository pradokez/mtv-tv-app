/**
 * Decides which of the site's existing channels a liked song belongs to:
 * the decade channel from the release year, and genre channels from the
 * artist's Spotify genres (rules in `curadoria/generos-canais.json`).
 */

export interface GenreRule {
  channel: string;
  genres: string[];
  exclude?: string[];
}

export class GenreRulesError extends Error {
  override name = "GenreRulesError";
}

const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === "string" && v.trim() !== "");

export function parseGenreRules(text: string): GenreRule[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GenreRulesError("as regras de gênero não são um JSON válido");
  }
  const list = typeof data === "object" && data !== null ? (data as { genres?: unknown }).genres : undefined;
  if (!Array.isArray(list)) throw new GenreRulesError('as regras deveriam ser { "genres": [...] }');
  return list.map((raw: unknown, index) => {
    const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const where = `regra na posição ${index}`;
    if (typeof r.channel !== "string" || r.channel.trim() === "") throw new GenreRulesError(`${where}: falta o canal`);
    if (!isTexts(r.genres) || r.genres.length === 0) throw new GenreRulesError(`${where} (${r.channel}): \`genres\` deveria ser uma lista de textos`);
    if (r.exclude !== undefined && !isTexts(r.exclude)) throw new GenreRulesError(`${where} (${r.channel}): \`exclude\` deveria ser uma lista de textos`);
    return { channel: r.channel, genres: r.genres, ...(r.exclude ? { exclude: r.exclude } : {}) };
  });
}

/** The decade channel id for a release year, or undefined before 1970. */
export function decadeChannel(year: number | undefined): string | undefined {
  if (year === undefined || !Number.isInteger(year) || year < 1970) return undefined;
  return year >= 2000 ? `${Math.floor(year / 10) * 10}s` : `${year % 100 - (year % 10)}s`;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word match, so "rap" does not match "trap". */
const hasTerm = (genre: string, term: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(term.toLowerCase())}(?![\\p{L}\\p{N}])`, "u").test(genre);

export interface ClassifiableTrack {
  year?: number;
  genres: readonly string[];
}

/** Channel ids the track fits, decade first, without repeats. */
export function classify(track: ClassifiableTrack, rules: readonly GenreRule[]): string[] {
  const channels: string[] = [];
  const decade = decadeChannel(track.year);
  if (decade) channels.push(decade);
  const genres = track.genres.map((g) => g.toLowerCase());
  for (const rule of rules) {
    const matched = genres.filter((g) => rule.genres.some((term) => hasTerm(g, term)));
    const excluded = (rule.exclude ?? []).some((term) => matched.some((g) => hasTerm(g, term)));
    if (matched.length > 0 && !excluded && !channels.includes(rule.channel)) channels.push(rule.channel);
  }
  return channels;
}
