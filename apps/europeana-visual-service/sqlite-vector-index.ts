import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { AutoTokenizer, CLIPTextModelWithProjection, env } from "@xenova/transformers";
import {
  clampVisualScore,
  EUROPEANA_SOURCE,
  type LocalVisualCandidate,
  type VectorIndex,
  type VisualSearchOptions,
} from "../../packages/europeana-visual-core/src/index";

const CLIP_TEXT_MODEL = "Xenova/clip-vit-base-patch32";
const SERVICE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SERVICE_DIR, "../..");
const DB_PATH = process.env.DATABASE_PATH || resolve(REPO_ROOT, "packages/data/kabinett.db");
const configuredClipModelPath = process.env.KABINETT_CLIP_MODEL_PATH?.trim();
const clipModelPathCandidates = [
  configuredClipModelPath,
  resolve(REPO_ROOT, "models"),
].filter((value): value is string => Boolean(value));
const clipModelPath = clipModelPathCandidates.find((value) => existsSync(value)) || clipModelPathCandidates[0];
const bundledClipModelPath = clipModelPath ? join(clipModelPath, CLIP_TEXT_MODEL) : null;
const hasBundledClipModel = bundledClipModelPath ? existsSync(bundledClipModelPath) : false;

env.allowLocalModels = true;
if (clipModelPath) {
  env.localModelPath = clipModelPath;
}
env.allowRemoteModels = process.env.KABINETT_CLIP_ALLOW_REMOTE === "1" || process.env.NODE_ENV !== "production";

if (process.env.NODE_ENV === "production" && !hasBundledClipModel) {
  console.warn("[Europeana Visual] Bundled CLIP model files not found; set KABINETT_CLIP_MODEL_PATH or KABINETT_CLIP_ALLOW_REMOTE=1 for hosted demos.");
}

type TextEncoder = {
  tokenizer: any;
  model: any;
};

type VectorRow = {
  artworkId: number;
  recordId: string | null;
  provider: string | null;
  distance: number;
};

type ClipEmbeddingSeedRow = {
  artwork_id: number;
  embedding: Buffer;
};

type AggregatedCandidate = {
  candidate: LocalVisualCandidate;
  rrfScore: number;
  maxScore: number;
};

let db: Database.Database | null = null;
let textEncoderPromise: Promise<TextEncoder> | null = null;
const queryEmbeddingCache = new Map<string, Buffer>();

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    sqliteVec.load(db);
    db.pragma("journal_mode = WAL");
    db.pragma("cache_size = -512000");
    db.pragma("mmap_size = 3221225472");
    db.pragma("temp_store = memory");
  }
  return db;
}

function normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  const denom = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) out[i] = vec[i] / denom;
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
  const cacheKey = query.trim().toLowerCase();
  const cached = queryEmbeddingCache.get(cacheKey);
  if (cached) return Buffer.from(cached);

  const { tokenizer, model } = await getTextEncoder();
  const inputs = tokenizer(query, { padding: true, truncation: true });
  const { text_embeds } = await model(inputs);
  const queryEmbedding = normalize(new Float32Array(text_embeds.data));
  const buffer = Buffer.from(
    queryEmbedding.buffer,
    queryEmbedding.byteOffset,
    queryEmbedding.byteLength,
  );
  queryEmbeddingCache.set(cacheKey, Buffer.from(buffer));
  return buffer;
}

function vectorFromBuffer(buffer: Buffer): Float32Array {
  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
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
    centroid.byteLength,
  );
}

function vecDistanceToScore(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  return clampVisualScore(1 / (1 + Math.max(0, distance)));
}

function toCandidate(row: VectorRow): LocalVisualCandidate | null {
  if (!row.recordId) return null;
  return {
    artworkId: row.artworkId,
    recordId: row.recordId,
    provider: row.provider,
    score: vecDistanceToScore(row.distance),
  };
}

function buildQueryVariants(query: string, mode: VisualSearchOptions["variantMode"] = "expanded"): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (mode === "strict") return [trimmed];

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (mode === "balanced") {
    if (wordCount === 1) return [trimmed];
    return [...new Set([trimmed, `an artwork depicting ${trimmed}`])];
  }

  const variants = [trimmed];
  if (wordCount <= 4) {
    variants.push(`a photo of ${trimmed}`);
    variants.push(`an artwork depicting ${trimmed}`);
  }
  return [...new Set(variants.map((variant) => variant.trim()).filter(Boolean))];
}

function runKnnQuery(vectorBlob: Buffer, k: number): LocalVisualCandidate[] {
  const rows = getDb().prepare(
    `SELECT map.artwork_id AS artworkId,
            v.distance AS distance,
            a.inventory_number AS recordId,
            a.sub_museum AS provider
     FROM vec_artworks v
     JOIN vec_artwork_map map ON map.vec_rowid = v.rowid
     JOIN artworks a ON a.id = map.artwork_id
     WHERE v.embedding MATCH ?
       AND k = ?
       AND a.source = ?
       AND a.inventory_number IS NOT NULL
       AND a.inventory_number != ''
       AND a.iiif_url IS NOT NULL
       AND LENGTH(a.iiif_url) > 40
       AND a.id NOT IN (SELECT artwork_id FROM broken_images)
     ORDER BY v.distance
     LIMIT ?`
  ).all(vectorBlob, k, EUROPEANA_SOURCE, k) as VectorRow[];

  return rows
    .map((row) => toCandidate(row))
    .filter((candidate): candidate is LocalVisualCandidate => Boolean(candidate));
}

function mergeVariantResults(results: LocalVisualCandidate[][], limit: number): LocalVisualCandidate[] {
  const aggregated = new Map<number, AggregatedCandidate>();
  const rrfK = 60;

  for (const rows of results) {
    for (let i = 0; i < rows.length; i += 1) {
      const candidate = rows[i];
      const rrf = 1 / (rrfK + i + 1);
      const existing = aggregated.get(candidate.artworkId);
      if (!existing) {
        aggregated.set(candidate.artworkId, {
          candidate,
          rrfScore: rrf,
          maxScore: candidate.score,
        });
        continue;
      }
      existing.rrfScore += rrf;
      if (candidate.score > existing.maxScore) {
        existing.maxScore = candidate.score;
        existing.candidate = candidate;
      }
    }
  }

  return [...aggregated.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore || b.maxScore - a.maxScore)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function createSqliteVectorIndex(): VectorIndex {
  return {
    async searchByText(query, limit, options) {
      const variants = buildQueryVariants(query, options?.variantMode);
      const results: LocalVisualCandidate[][] = [];

      for (const variant of variants) {
        const embedding = await embedQuery(variant);
        results.push(runKnnQuery(embedding, limit));
      }

      return mergeVariantResults(results, limit);
    },

    async searchBySeedArtworkIds(seedArtworkIds, limit) {
      const uniqueSeedIds = [...new Set(seedArtworkIds)]
        .filter((id) => Number.isInteger(id))
        .slice(0, 24);
      if (uniqueSeedIds.length === 0) return [];

      const placeholders = uniqueSeedIds.map(() => "?").join(",");
      const seedRows = getDb().prepare(
        `SELECT artwork_id, embedding
         FROM clip_embeddings
         WHERE artwork_id IN (${placeholders})`
      ).all(...uniqueSeedIds) as ClipEmbeddingSeedRow[];
      const centroid = buildCentroidEmbedding(seedRows);
      if (!centroid) return [];

      const seedSet = new Set(uniqueSeedIds);
      return runKnnQuery(centroid, Math.max(120, limit + uniqueSeedIds.length))
        .filter((candidate) => !seedSet.has(candidate.artworkId))
        .slice(0, limit);
    },

    getArtworkIdsForRecordId(recordId) {
      const rows = getDb().prepare(
        `SELECT id
         FROM artworks
         WHERE source = ?
           AND inventory_number = ?`
      ).all(EUROPEANA_SOURCE, recordId) as Array<{ id: number }>;

      return rows.map((row) => row.id);
    },

    getNeighborCandidates(seedArtworkIds, limit) {
      const uniqueSeedIds = [...new Set(seedArtworkIds)].filter((id) => Number.isInteger(id));
      if (uniqueSeedIds.length === 0) return [];

      const placeholders = uniqueSeedIds.map(() => "?").join(",");
      const rows = getDb().prepare(
        `SELECT n.neighbor_artwork_id AS artworkId,
                n.distance AS distance,
                a.inventory_number AS recordId,
                a.sub_museum AS provider
         FROM artwork_neighbors n
         JOIN artworks a ON a.id = n.neighbor_artwork_id
         WHERE n.artwork_id IN (${placeholders})
           AND a.source = ?
           AND a.inventory_number IS NOT NULL
           AND a.inventory_number != ''
         ORDER BY n.rank ASC
         LIMIT ?`
      ).all(...uniqueSeedIds, EUROPEANA_SOURCE, limit) as VectorRow[];

      return rows
        .map((row) => toCandidate(row))
        .filter((candidate): candidate is LocalVisualCandidate => Boolean(candidate));
    },
  };
}

export function getDemoSeedRecordIds(limit: number): string[] {
  const rows = getDb().prepare(
    `SELECT a.inventory_number AS recordId
     FROM artworks a
     JOIN vec_artwork_map map ON map.artwork_id = a.id
     WHERE a.source = ?
       AND a.inventory_number IS NOT NULL
       AND a.inventory_number != ''
       AND a.iiif_url IS NOT NULL
       AND LENGTH(a.iiif_url) > 40
       AND a.id NOT IN (SELECT artwork_id FROM broken_images)
     GROUP BY a.inventory_number
     ORDER BY RANDOM()
     LIMIT ?`
  ).all(EUROPEANA_SOURCE, limit) as Array<{ recordId: string }>;

  return rows.map((row) => row.recordId);
}
