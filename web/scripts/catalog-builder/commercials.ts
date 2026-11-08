/**
 * The hand-curated list of Brazilian commercials played in the breaks between
 * clips (`web/curadoria/comerciais-br.json`). It lives outside the site's data:
 * the Catalog Builder reads it, checks duration and embed status like any
 * other video, and copies what survives into the snapshot.
 */

export interface CuratedCommercial {
  /** YouTube video id. */
  id: string;
  brand: string;
  title: string;
  /** Year it aired, `null` when unknown. */
  year: number | null;
}

export class CommercialsError extends Error {
  override name = "CommercialsError";
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Parses the curated file's text. The order of the file is kept. */
export function parseCuratedCommercials(text: string): CuratedCommercial[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new CommercialsError("a curadoria de comerciais não é um JSON válido");
  }
  const list = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as { commercials?: unknown }).commercials : undefined;
  if (list === undefined) throw new CommercialsError("a curadoria deveria ser { \"commercials\": [...] }");
  if (!Array.isArray(list)) throw new CommercialsError("`commercials` deveria ser uma lista");

  const seen = new Set<string>();
  return list.map((raw: unknown, index) => {
    const where = `comercial na posição ${index}`;
    const e = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    if (typeof e.id !== "string" || !YOUTUBE_ID.test(e.id)) {
      throw new CommercialsError(`${where}: ID do YouTube inválido`);
    }
    if (typeof e.brand !== "string" || typeof e.title !== "string" || (e.year !== null && typeof e.year !== "number")) {
      throw new CommercialsError(`${where} inválido (esperava id, brand, title e year)`);
    }
    if (seen.has(e.id)) throw new CommercialsError(`${where}: ID repetido (${e.id})`);
    seen.add(e.id);
    return { id: e.id, brand: e.brand, title: e.title, year: e.year };
  });
}
