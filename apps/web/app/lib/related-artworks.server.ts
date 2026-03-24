import { getDb } from "./db.server";
import { sourceFilter } from "./museums.server";
import { parseArtists } from "./parsing";

type RelatedArtworkRow = {
  id: number;
  title_sv: string | null;
  title_en: string | null;
  iiif_url: string;
  dominant_color: string | null;
  artists: string | null;
  dating_text: string | null;
  focal_x: number | null;
  focal_y: number | null;
};

type RelatedResult = {
  artistName: string | null;
  sameArtist: RelatedArtworkRow[];
  similar: RelatedArtworkRow[];
  budgetExceeded: boolean;
};

type CacheEntry = {
  value: RelatedResult;
  expiresAt: number;
};

const RELATED_CACHE_TTL_MS = Number(process.env.KABINETT_RELATED_CACHE_MS ?? "600000");
const RELATED_BUDGET_MS = Number(process.env.KABINETT_RELATED_BUDGET_MS ?? "250");
const RELATED_K = Number(process.env.KABINETT_RELATED_K ?? "16");
const RELATED_SIMILAR_LIMIT = Number(process.env.KABINETT_RELATED_SIMILAR_LIMIT ?? "8");
const RELATED_SAME_ARTIST_CANDIDATES = Number(process.env.KABINETT_RELATED_SAME_ARTIST_CANDIDATES ?? "24");
const RELATED_SAME_ARTIST_LIMIT = Number(process.env.KABINETT_RELATED_SAME_ARTIST_LIMIT ?? "6");

const relatedCache = new Map<string, CacheEntry>();

function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100;
}

function toCacheKey(artworkId: number, sourceSql: string, sourceParams: string[]): string {
  return `${artworkId}:${sourceSql}:${sourceParams.join(",")}`;
}

function normalizeArtistName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex]!, copy[index]!];
  }
  return copy;
}

function logRelated(event: string, payload: Record<string, unknown>) {
  console.log(`[PERF][server] ${JSON.stringify({ ts: new Date().toISOString(), event, ...payload })}`);
}

export function getRelatedArtworks(artworkId: number): RelatedResult {
  const db = getDb();
  const source = sourceFilter();
  const cacheKey = toCacheKey(artworkId, source.sql, source.params);
  const now = Date.now();
  const cached = relatedCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const startedAt = performance.now();

  const artworkRow = db
    .prepare(`SELECT id, artists FROM artworks WHERE id = ? AND ${source.sql}`)
    .get(artworkId, ...source.params) as { id: number; artists: string | null } | undefined;

  if (!artworkRow) {
    return { artistName: null, sameArtist: [], similar: [], budgetExceeded: false };
  }

  const artistName = parseArtists(artworkRow.artists)[0]?.name?.trim() || null;
  const knownArtist = artistName && !artistName.match(/^(okänd|unknown|anonym)/i);

  let similar: RelatedArtworkRow[] = [];
  let sameArtist: RelatedArtworkRow[] = [];
  let budgetExceeded = false;

  try {
    similar = db.prepare(
      `SELECT
         n.neighbor_artwork_id AS id,
         a.title_sv,
         a.title_en,
         a.iiif_url,
         a.dominant_color,
         a.artists,
         a.dating_text,
         a.focal_x,
         a.focal_y
       FROM artwork_neighbors n
       JOIN artworks a ON a.id = n.neighbor_artwork_id
       WHERE n.artwork_id = ?
         AND a.id NOT IN (SELECT artwork_id FROM broken_images)
         AND ${source.sql}
       ORDER BY n.rank
       LIMIT ?`
    ).all(artworkId, ...source.params, RELATED_SIMILAR_LIMIT) as RelatedArtworkRow[];
  } catch {
    similar = [];
  }

  if (similar.length === 0) {
    try {
      similar = db.prepare(
        `SELECT
           map.artwork_id AS id,
           a.title_sv,
           a.title_en,
           a.iiif_url,
           a.dominant_color,
           a.artists,
           a.dating_text,
           a.focal_x,
           a.focal_y
         FROM vec_artworks v
         JOIN vec_artwork_map map ON map.vec_rowid = v.rowid
         JOIN artworks a ON a.id = map.artwork_id
         WHERE v.embedding MATCH (
             SELECT embedding FROM clip_embeddings WHERE artwork_id = ?
           )
           AND k = ?
           AND map.artwork_id != ?
           AND a.id NOT IN (SELECT artwork_id FROM broken_images)
           AND ${source.sql}
         ORDER BY v.distance
         LIMIT ?`
      ).all(artworkId, RELATED_K, artworkId, ...source.params, RELATED_SIMILAR_LIMIT) as RelatedArtworkRow[];
    } catch {
      similar = [];
    }
  }

  const elapsedAfterSimilar = performance.now() - startedAt;
  if (elapsedAfterSimilar > RELATED_BUDGET_MS) {
    budgetExceeded = true;
    logRelated("related.budget_exceeded", {
      artworkId,
      stage: "similar",
      durationMs: roundMs(elapsedAfterSimilar),
      budgetMs: RELATED_BUDGET_MS,
    });
    const value = { artistName, sameArtist: [], similar, budgetExceeded };
    relatedCache.set(cacheKey, { value, expiresAt: now + RELATED_CACHE_TTL_MS });
    return value;
  }

  if (knownArtist) {
    const normalizedArtist = normalizeArtistName(artistName);
    if (normalizedArtist) {
      try {
        const indexedSameArtist = db.prepare(
          `SELECT
             a.id,
             a.title_sv,
             a.title_en,
             a.iiif_url,
             a.dominant_color,
             a.artists,
             a.dating_text,
             a.focal_x,
             a.focal_y
           FROM artwork_artists aa
           JOIN artworks a ON a.id = aa.artwork_id
           WHERE aa.artist_name_norm = ?
             AND aa.artwork_id != ?
             AND a.iiif_url IS NOT NULL
             AND a.id NOT IN (SELECT artwork_id FROM broken_images)
             AND ${source.sql}
           LIMIT ?`
        ).all(normalizedArtist, artworkId, ...source.params, RELATED_SAME_ARTIST_CANDIDATES) as RelatedArtworkRow[];
        sameArtist = shuffle(indexedSameArtist).slice(0, RELATED_SAME_ARTIST_LIMIT);
      } catch {
        sameArtist = [];
      }
    }

    if (sameArtist.length === 0) {
      const fallbackCandidates = db
        .prepare(
          `SELECT
             id,
             title_sv,
             title_en,
             iiif_url,
             dominant_color,
             artists,
             dating_text,
             focal_x,
             focal_y
           FROM artworks
           WHERE id != ? AND artists LIKE ? AND iiif_url IS NOT NULL
             AND id NOT IN (SELECT artwork_id FROM broken_images)
             AND ${source.sql}
           LIMIT ?`
        )
        .all(artworkId, `%${artistName}%`, ...source.params, RELATED_SAME_ARTIST_CANDIDATES) as RelatedArtworkRow[];

      sameArtist = shuffle(fallbackCandidates).slice(0, RELATED_SAME_ARTIST_LIMIT);
    }
  }

  const totalDurationMs = performance.now() - startedAt;
  budgetExceeded = totalDurationMs > RELATED_BUDGET_MS;
  if (budgetExceeded) {
    logRelated("related.budget_exceeded", {
      artworkId,
      stage: "sameArtist",
      durationMs: roundMs(totalDurationMs),
      budgetMs: RELATED_BUDGET_MS,
    });
  } else {
    logRelated("related.complete", {
      artworkId,
      durationMs: roundMs(totalDurationMs),
      similar: similar.length,
      sameArtist: sameArtist.length,
    });
  }

  const value = { artistName, sameArtist, similar, budgetExceeded };
  relatedCache.set(cacheKey, { value, expiresAt: now + RELATED_CACHE_TTL_MS });
  return value;
}
