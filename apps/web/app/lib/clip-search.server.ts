import { getDb } from "./db.server";
import { buildImageUrl } from "./images";
import { sourceFilter } from "./museums.server";
import { parseArtist } from "./parsing";
import { AutoTokenizer, CLIPTextModelWithProjection, env } from "@xenova/transformers";

env.allowLocalModels = false;

export const CLIP_TEXT_MODEL = "Xenova/clip-vit-base-patch32";
const QUERY_EMBEDDING_VERSION = "clip-b32-v2";
const QUERY_PROMPT_VERSION = "prompt-ensemble-v1";
const ENABLE_DB_QUERY_CACHE = process.env.KABINETT_CLIP_QUERY_CACHE === "1";

export type ClipResult = {
  id: number;
  title: string;
  artist: string;
  imageUrl: string;
  heroUrl: string;
  year: string;
  color: string;
  similarity: number;
  museum_name: string | null;
  source: string | null;
  sub_museum: string | null;
  focal_x: number | null;
  focal_y: number | null;
};

type VectorRow = {
  id: number;
  distance: number;
  title_sv: string | null;
  title_en: string | null;
  iiif_url: string;
  dominant_color: string | null;
  artists: string | null;
  dating_text: string | null;
  museum_name: string | null;
  source: string | null;
  sub_museum: string | null;
  focal_x: number | null;
  focal_y: number | null;
};

type QueryEmbeddingRow = {
  embedding: Buffer;
};

type ClipEmbeddingSeedRow = {
  artwork_id: number;
  embedding: Buffer;
};

type AggregatedCandidate = {
  row: VectorRow;
  rrfScore: number;
  maxDistance: number;
};

type SearchScope = {
  source: string | null;
  subMuseum: string | null;
  collectionName: string | null;
};

type TextEncoder = {
  tokenizer: any;
  model: any;
};

let textEncoderPromise: Promise<TextEncoder> | null = null;
let queryCacheInitAttempted = false;
let queryCacheWritable = false;
let queryCacheWarningShown = false;
let localVecAvailability: boolean | null = null;
let localVecWarningShown = false;
let faissFallbackWarningShown = false;

function logQueryCacheWarning(error: unknown): void {
  if (queryCacheWarningShown) return;
  queryCacheWarningShown = true;
  console.warn("[CLIP] Query embedding cache unavailable:", error);
}

function initQueryEmbeddingCache(): void {
  if (!ENABLE_DB_QUERY_CACHE) return;
  if (queryCacheInitAttempted) return;
  queryCacheInitAttempted = true;
  const db = getDb();

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS query_embeddings (
        query TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    queryCacheWritable = true;
  } catch (error) {
    queryCacheWritable = false;
    logQueryCacheWarning(error);
  }
}

function hasLocalVecIndex(): boolean {
  if (localVecAvailability !== null) return localVecAvailability;

  const db = getDb();
  try {
    const rows = db.prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type IN ('table', 'view')
         AND name IN ('vec_artworks', 'vec_artwork_map')`
    ).all() as Array<{ name: string }>;
    localVecAvailability = rows.length === 2;
  } catch {
    localVecAvailability = false;
  }
  return localVecAvailability;
}

function vecDistanceToSimilarity(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  const normalizedDistance = Math.max(0, distance);
  return clampSimilarity(1 / (1 + normalizedDistance));
}

function logLocalVecWarning(error: unknown): void {
  if (localVecWarningShown) return;
  localVecWarningShown = true;
  console.warn("[CLIP] Local sqlite-vec fallback unavailable:", error);
}

function logFaissFallbackWarning(error: unknown): void {
  if (faissFallbackWarningShown) return;
  faissFallbackWarningShown = true;
  console.warn("[CLIP] FAISS unavailable, falling back to sqlite-vec:", error);
}

function getCachedQueryEmbedding(query: string): Buffer | null {
  if (!ENABLE_DB_QUERY_CACHE) return null;
  const db = getDb();

  try {
    const row = db
      .prepare("SELECT embedding FROM query_embeddings WHERE query = ?")
      .get(query) as QueryEmbeddingRow | undefined;

    return row?.embedding ?? null;
  } catch {
    return null;
  }
}

function storeQueryEmbedding(query: string, embedding: Buffer): void {
  if (!ENABLE_DB_QUERY_CACHE) return;
  initQueryEmbeddingCache();
  if (!queryCacheWritable) return;

  const db = getDb();

  try {
    db
      .prepare("INSERT OR REPLACE INTO query_embeddings (query, embedding) VALUES (?, ?)")
      .run(query, embedding);
  } catch (error) {
    queryCacheWritable = false;
    logQueryCacheWarning(error);
  }
}

function normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const denom = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / denom;
  return out;
}

async function getTextEncoder(): Promise<TextEncoder> {
  if (!textEncoderPromise) {
    textEncoderPromise = Promise.all([
      AutoTokenizer.from_pretrained(CLIP_TEXT_MODEL),
      CLIPTextModelWithProjection.from_pretrained(CLIP_TEXT_MODEL, { quantized: false }),
    ])
      .then(([tokenizer, model]) => ({ tokenizer, model }))
      .catch((error) => {
        textEncoderPromise = null;
        throw error;
      });
  }
  return textEncoderPromise;
}

async function embedQuery(query: string): Promise<Buffer> {
  const { tokenizer, model } = await getTextEncoder();
  const inputs = tokenizer(query, { padding: true, truncation: true });
  const { text_embeds } = await model(inputs);
  const queryEmbedding = normalize(new Float32Array(text_embeds.data));
  return Buffer.from(
    queryEmbedding.buffer,
    queryEmbedding.byteOffset,
    queryEmbedding.byteLength
  );
}

const ENABLE_FAISS = process.env.KABINETT_ENABLE_FAISS === "1" || Boolean(process.env.FAISS_URL);
const FAISS_URL = (process.env.FAISS_URL || "http://127.0.0.1:5555").replace(/\/+$/, "");

function clampSimilarity(distance: number): number {
  if (distance > 1) return 1;
  if (distance < -1) return -1;
  return distance;
}

function buildQueryVariants(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // Keep single-word object queries strict to reduce prompt drift.
  if (wordCount === 1) {
    return [trimmed];
  }

  const base = [trimmed];

  if (wordCount <= 4) {
    base.push(`a photo of ${trimmed}`);
    base.push(`a close-up photo of ${trimmed}`);
    base.push(`an object: ${trimmed}`);
    base.push(`a painting of ${trimmed}`);
    base.push(`a still life with ${trimmed}`);
    base.push(`an artwork depicting ${trimmed}`);
  }

  return [...new Set(base.map((row) => row.trim()).filter(Boolean))];
}

function vectorFromBuffer(buffer: Buffer): Float32Array {
  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
}

function buildCentroidEmbedding(rows: ClipEmbeddingSeedRow[]): Buffer | null {
  if (rows.length === 0) return null;
  const dim = 512;
  const acc = new Float32Array(dim);
  let count = 0;

  for (const row of rows) {
    if (!row.embedding || row.embedding.byteLength !== dim * Float32Array.BYTES_PER_ELEMENT) {
      continue;
    }
    const vec = vectorFromBuffer(row.embedding);
    for (let i = 0; i < dim; i += 1) {
      acc[i] += vec[i] ?? 0;
    }
    count += 1;
  }

  if (count === 0) return null;
  for (let i = 0; i < dim; i += 1) {
    acc[i] /= count;
  }
  const centroid = normalize(acc);
  return Buffer.from(
    centroid.buffer,
    centroid.byteOffset,
    centroid.byteLength
  );
}

function toClipResult(row: VectorRow, similarity: number): ClipResult {
  return {
    id: row.id,
    title: row.title_sv || row.title_en || "Utan titel",
    artist: parseArtist(row.artists),
    imageUrl: buildImageUrl(row.iiif_url, 400),
    heroUrl: buildImageUrl(row.iiif_url, 800),
    year: row.dating_text || "",
    color: row.dominant_color || "#D4CDC3",
    similarity: clampSimilarity(similarity),
    museum_name: row.museum_name ?? null,
    source: row.source ?? null,
    sub_museum: row.sub_museum ?? null,
    focal_x: row.focal_x ?? null,
    focal_y: row.focal_y ?? null,
  };
}

function parseSearchScope(rawFilter?: string | null): SearchScope {
  const effectiveFilter = rawFilter?.trim() || null;
  if (!effectiveFilter) {
    return {
      source: null,
      subMuseum: null,
      collectionName: null,
    };
  }

  if (effectiveFilter.startsWith("shm:")) {
    return {
      source: "shm",
      subMuseum: effectiveFilter.slice(4),
      collectionName: effectiveFilter.slice(4),
    };
  }

  if (effectiveFilter.startsWith("collection:")) {
    return {
      source: null,
      subMuseum: null,
      collectionName: effectiveFilter.slice("collection:".length).trim() || null,
    };
  }

  return {
    source: effectiveFilter,
    subMuseum: null,
    collectionName: null,
  };
}

async function runKnnQuery(
  vectorBlob: Buffer,
  k: number,
  allowedSource: { sql: string; params: string[] },
  filterSource?: string | null,
  filterSubMuseum?: string | null,
  filterCollectionName?: string | null,
): Promise<VectorRow[]> {
  const db = getDb();
  const queryFaiss = async (): Promise<VectorRow[]> => {
    const queryVector = Array.from(new Float32Array(
      vectorBlob.buffer,
      vectorBlob.byteOffset,
      vectorBlob.byteLength / Float32Array.BYTES_PER_ELEMENT
    ));

    const body: Record<string, unknown> = {
      vector: queryVector,
      k,
      allowed_sources: allowedSource.params,
    };
    if (filterSubMuseum) {
      body.filter_sub_museum = filterSubMuseum;
    } else if (filterSource) {
      body.filter_source = filterSource;
    }

    const res = await fetch(`${FAISS_URL}/knn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`FAISS server error: ${res.status}`);
    }

    const data = await res.json() as { results: Array<{ artwork_id: number; distance: number }> };
    const artworkIds = data.results.map((r) => r.artwork_id);
    if (artworkIds.length === 0) return [];

    const placeholders = artworkIds.map(() => "?").join(",");
    const metaRows = db.prepare(
      `SELECT a.id, a.title_sv, a.title_en, a.iiif_url, a.dominant_color, a.artists, a.dating_text,
              a.source, a.sub_museum, COALESCE(a.sub_museum, m.name) as museum_name,
              a.focal_x, a.focal_y
       FROM artworks a
       LEFT JOIN museums m ON m.id = a.source
       WHERE a.id IN (${placeholders})
         ${filterCollectionName ? "AND COALESCE(a.sub_museum, m.name) = ?" : ""}`
    ).all(...artworkIds, ...(filterCollectionName ? [filterCollectionName] : [])) as Array<Omit<VectorRow, "distance">>;

    const metaMap = new Map(metaRows.map((r) => [r.id, r]));
    const distanceMap = new Map(data.results.map((r) => [r.artwork_id, r.distance]));

    return artworkIds
      .map((id) => {
        const meta = metaMap.get(id);
        if (!meta) return null;
        return { ...meta, distance: distanceMap.get(id) ?? 0 } as VectorRow;
      })
      .filter((r): r is VectorRow => r !== null);
  };

  const queryLocalVec = (): VectorRow[] => {
    if (!hasLocalVecIndex()) return [];

    const scopedSql = filterSubMuseum
      ? "AND a.source = 'shm' AND a.sub_museum = ?"
      : filterCollectionName
        ? "AND COALESCE(a.sub_museum, m.name) = ?"
      : filterSource
        ? "AND a.source = ?"
        : "";
    const scopedParams = filterSubMuseum
      ? [filterSubMuseum]
      : filterCollectionName
        ? [filterCollectionName]
      : filterSource
        ? [filterSource]
        : [];

    const rows = db.prepare(
      `SELECT map.artwork_id AS id,
              v.distance AS distance,
              a.title_sv,
              a.title_en,
              a.iiif_url,
              a.dominant_color,
              a.artists,
              a.dating_text,
              COALESCE(a.sub_museum, m.name) as museum_name,
              a.source,
              a.sub_museum,
              a.focal_x,
              a.focal_y
       FROM vec_artworks v
       JOIN vec_artwork_map map ON map.vec_rowid = v.rowid
       JOIN artworks a ON a.id = map.artwork_id
       LEFT JOIN museums m ON m.id = a.source
       WHERE v.embedding MATCH ?
         AND k = ?
         AND a.iiif_url IS NOT NULL
         AND LENGTH(a.iiif_url) > 40
         AND a.id NOT IN (SELECT artwork_id FROM broken_images)
         AND ${allowedSource.sql}
         ${scopedSql}
       ORDER BY v.distance
       LIMIT ?`
    ).all(vectorBlob, k, ...allowedSource.params, ...scopedParams, k) as VectorRow[];

    return rows.map((row) => ({
      ...row,
      distance: vecDistanceToSimilarity(row.distance),
    }));
  };

  if (!ENABLE_FAISS) {
    try {
      return queryLocalVec();
    } catch (localError) {
      logLocalVecWarning(localError);
      return [];
    }
  }

  try {
    return await queryFaiss();
  } catch (error) {
    logFaissFallbackWarning(error);
    try {
      return queryLocalVec();
    } catch (localError) {
      logLocalVecWarning(localError);
      console.error("[CLIP] Original FAISS error:", error);
      return [];
    }
  }
}

export async function clipSearch(q: string, limit = 60, offset = 0, source?: string): Promise<ClipResult[]> {
  initQueryEmbeddingCache();
  const variants = buildQueryVariants(q);
  if (variants.length === 0) return [];

  const scope = parseSearchScope(source);
  const desiredCount = offset + limit;
  const allowedSource = sourceFilter("a");
  const desiredK = scope.collectionName
    ? Math.max(400, desiredCount * 6)
    : Math.max(120, desiredCount);
  const perVariantK = Math.max(desiredK, Math.ceil(desiredK * 1.5 / variants.length));
  const aggregated = new Map<number, AggregatedCandidate>();
  const RRF_K = 60;

  for (const variant of variants) {
    const variantKey = `${QUERY_EMBEDDING_VERSION}:${QUERY_PROMPT_VERSION}:${variant.trim().toLowerCase()}`;
    let queryBuffer = getCachedQueryEmbedding(variantKey);
    if (!queryBuffer) {
      queryBuffer = await embedQuery(variant);
      storeQueryEmbedding(variantKey, queryBuffer);
    }

    const rows = await runKnnQuery(
      queryBuffer,
      perVariantK,
      allowedSource,
      scope.source,
      scope.subMuseum,
      scope.collectionName
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rrf = 1 / (RRF_K + i + 1);
      const existing = aggregated.get(row.id);
      if (!existing) {
        aggregated.set(row.id, { row, rrfScore: rrf, maxDistance: row.distance });
        continue;
      }
      existing.rrfScore += rrf;
      if (row.distance > existing.maxDistance) {
        existing.maxDistance = row.distance;
        existing.row = row;
      }
    }
  }

  const mergedRows = [...aggregated.values()]
    .sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) return b.rrfScore - a.rrfScore;
      return b.maxDistance - a.maxDistance;
    })
    .slice(offset, offset + limit);

  return mergedRows.map(({ row, maxDistance }) => toClipResult(row, maxDistance));
}

export async function clipSearchFromSeedIds(
  seedArtworkIds: number[],
  limit = 60,
  offset = 0,
  source?: string
): Promise<ClipResult[]> {
  const uniqueSeedIds = [...new Set(seedArtworkIds)]
    .filter((id) => Number.isInteger(id))
    .slice(0, 24);
  if (uniqueSeedIds.length === 0) return [];

  const db = getDb();
  const placeholders = uniqueSeedIds.map(() => "?").join(",");
  const seedRows = db.prepare(
    `SELECT artwork_id, embedding
     FROM clip_embeddings
     WHERE artwork_id IN (${placeholders})`
  ).all(...uniqueSeedIds) as ClipEmbeddingSeedRow[];
  const centroid = buildCentroidEmbedding(seedRows);
  if (!centroid) return [];

  const effectiveFilter = source?.trim() || null;
  const scope = parseSearchScope(effectiveFilter);
  const desiredCount = offset + limit + uniqueSeedIds.length;
  const allowedSource = sourceFilter("a");
  const desiredK = scope.collectionName
    ? Math.max(400, desiredCount * 6)
    : Math.max(120, desiredCount);
  const rows = await runKnnQuery(
    centroid,
    desiredK,
    allowedSource,
    scope.source,
    scope.subMuseum,
    scope.collectionName
  );
  const seedSet = new Set(uniqueSeedIds);
  const filtered = rows.filter((row) => !seedSet.has(row.id));

  return filtered
    .slice(offset, offset + limit)
    .map((row) => toClipResult(row, row.distance));
}

/** Pre-load the CLIP text model so the first search is instant */
export function warmupClip(): void {
  getTextEncoder()
    .then(() => console.log("[CLIP] Model loaded and ready"))
    .catch((err) => console.error("[CLIP] Warmup failed:", err));
}

// Auto-warmup on module import
warmupClip();
