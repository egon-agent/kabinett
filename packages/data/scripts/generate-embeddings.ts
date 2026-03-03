/**
 * Generate CLIP image embeddings and focal points for artworks.
 *
 * Usage:
 *   pnpm embeddings:generate
 *   pnpm embeddings:generate --clean
 */

import Database from "better-sqlite3";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from "@xenova/transformers";
import sharp from "sharp";
import { externalImageUrl } from "../../../apps/web/app/lib/images";
import * as sqliteVec from "sqlite-vec";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../kabinett.db");
const BATCH_SIZE = 50;
const CONCURRENCY = 32;
const FETCH_RETRIES = 1;
const FETCH_BACKOFF_MS = 500;
const IMAGE_WIDTH = 400;
const NEIGHBOR_LIMIT = 12;
const NEIGHBOR_K = 48;

type ArtworkRow = {
  id: number;
  iiif_url: string;
};

type FocalPoint = {
  x: number;
  y: number;
};

type EmbeddingWrite = {
  id: number;
  embeddingBuffer: Buffer;
  focalPoint: FocalPoint;
};

function ensureArtworkColumn(db: Database.Database, column: string, definition: string) {
  try {
    db.exec(`ALTER TABLE artworks ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!message.includes("duplicate column name")) {
      throw error;
    }
  }
}

function initDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  sqliteVec.load(db);

  ensureArtworkColumn(db, "focal_x", "REAL DEFAULT 0.5");
  ensureArtworkColumn(db, "focal_y", "REAL DEFAULT 0.5");

  db.exec(`
    CREATE TABLE IF NOT EXISTS clip_embeddings (
      artwork_id INTEGER PRIMARY KEY REFERENCES artworks(id),
      embedding BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_clip_embeddings_artwork ON clip_embeddings(artwork_id);
    CREATE TABLE IF NOT EXISTS artwork_neighbors (
      artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
      neighbor_artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
      rank INTEGER NOT NULL,
      distance REAL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (artwork_id, rank),
      UNIQUE (artwork_id, neighbor_artwork_id)
    );
    CREATE INDEX IF NOT EXISTS idx_artwork_neighbors_artwork ON artwork_neighbors(artwork_id, rank);
  `);

  return db;
}

function normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const denom = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / denom;
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retries = FETCH_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: "follow", ...init });
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(FETCH_BACKOFF_MS * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      return res;
    }

    if (!shouldRetryStatus(res.status) || attempt === retries) {
      throw new Error(`HTTP ${res.status}`);
    }

    await sleep(FETCH_BACKOFF_MS * 2 ** attempt);
  }

  throw new Error("fetchWithRetry: all retries failed");
}

async function computeFocalPoint(imageBuffer: Buffer): Promise<FocalPoint> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width <= 0 || height <= 0) {
    return { x: 0.5, y: 0.5 };
  }

  const { info } = await sharp(imageBuffer)
    .resize(100, 100, { fit: "cover", position: "attention" })
    .toBuffer({ resolveWithObject: true });

  const cropOffsetLeft = info.cropOffsetLeft || 0;
  const cropOffsetTop = info.cropOffsetTop || 0;
  const scale = Math.max(100 / width, 100 / height);
  const cropWidth = 100 / scale;
  const cropHeight = 100 / scale;

  const centerX = (cropOffsetLeft + cropWidth / 2) / width;
  const centerY = (cropOffsetTop + cropHeight / 2) / height;

  return {
    x: clamp01(centerX),
    y: clamp01(centerY),
  };
}

async function prepareClipInput(imageBuffer: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(imageBuffer)
    .resize(224, 224, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return new RawImage(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    info.channels
  );
}

function parseCleanFlag(): boolean {
  return process.argv.includes("--clean");
}

function shouldSkipNeighborRefresh(): boolean {
  return process.argv.includes("--skip-neighbors-refresh");
}

function refreshNeighborsForIds(db: Database.Database, artworkIds: number[]) {
  if (artworkIds.length === 0) return;

  const uniqueIds = [...new Set(artworkIds)];
  const getNeighbors = db.prepare(
    `SELECT
       map.artwork_id AS neighbor_id,
       v.distance AS distance
     FROM vec_artworks v
     JOIN vec_artwork_map map ON map.vec_rowid = v.rowid
     JOIN artworks a ON a.id = map.artwork_id
     WHERE v.embedding MATCH (
         SELECT embedding FROM clip_embeddings WHERE artwork_id = ?
       )
       AND k = ?
       AND map.artwork_id != ?
       AND a.iiif_url IS NOT NULL
       AND a.id NOT IN (SELECT artwork_id FROM broken_images)
     ORDER BY v.distance
     LIMIT ?`
  );
  const clearNeighbors = db.prepare("DELETE FROM artwork_neighbors WHERE artwork_id = ?");
  const upsertNeighbor = db.prepare(
    `INSERT OR REPLACE INTO artwork_neighbors
      (artwork_id, neighbor_artwork_id, rank, distance, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  );
  const replaceForOne = db.transaction((artworkId: number, rows: Array<{ neighbor_id: number; distance: number | null }>) => {
    clearNeighbors.run(artworkId);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;
      upsertNeighbor.run(artworkId, row.neighbor_id, i + 1, row.distance);
    }
  });

  let refreshed = 0;
  for (const artworkId of uniqueIds) {
    try {
      const rows = getNeighbors.all(artworkId, NEIGHBOR_K, artworkId, NEIGHBOR_LIMIT * 3) as Array<{ neighbor_id: number; distance: number | null }>;
      if (rows.length === 0) continue;
      replaceForOne(artworkId, rows.slice(0, NEIGHBOR_LIMIT));
      refreshed += 1;
    } catch {
      // Skip rows that cannot be vector-matched yet
    }
  }
  console.log(`   Refreshed neighbors for ${refreshed}/${uniqueIds.length} artworks`);
}

async function main() {
  const cleanStart = parseCleanFlag();
  const skipNeighborRefresh = shouldSkipNeighborRefresh();

  console.log("\n🎨 Kabinett CLIP + Focal Point Generation");
  console.log(`   Database: ${DB_PATH}`);
  console.log(`   Mode: ${cleanStart ? "clean" : "incremental"}`);

  const db = initDb();

  try {
    if (cleanStart) {
      db.exec(`
        DROP TABLE IF EXISTS clip_embeddings;
        CREATE TABLE clip_embeddings (
          artwork_id INTEGER PRIMARY KEY REFERENCES artworks(id),
          embedding BLOB
        );
        CREATE INDEX IF NOT EXISTS idx_clip_embeddings_artwork ON clip_embeddings(artwork_id);
      `);

      db.prepare("UPDATE artworks SET focal_x = 0.5, focal_y = 0.5").run();
    }

    const totalWithImages = (
      db.prepare(
        `SELECT COUNT(*) as c
         FROM artworks a
         WHERE a.iiif_url IS NOT NULL
           AND LENGTH(a.iiif_url) > 40
           AND a.id NOT IN (SELECT artwork_id FROM broken_images)`
      ).get() as { c: number }
    ).c;

    const alreadyEmbedded = (
      db.prepare(
        `SELECT COUNT(*) as c
         FROM artworks a
         JOIN clip_embeddings c ON c.artwork_id = a.id
         WHERE a.iiif_url IS NOT NULL
           AND LENGTH(a.iiif_url) > 40
           AND a.id NOT IN (SELECT artwork_id FROM broken_images)`
      ).get() as { c: number }
    ).c;

    const totalRemaining = Math.max(totalWithImages - alreadyEmbedded, 0);

    console.log(`   Total images: ${totalWithImages}`);
    console.log(`   Already embedded: ${alreadyEmbedded}`);
    console.log(`   Remaining: ${totalRemaining}\n`);

    if (totalRemaining === 0) {
      console.log("✅ All artworks already have embeddings.");
      return;
    }

    console.log("   Loading CLIP vision model...");
    const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32");
    const visionModel = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32");
    console.log("   Model loaded!\n");

    // Collect all IDs that need embedding upfront, then batch through them
    console.log("   Collecting artwork IDs to embed...");
    const allIds = db.prepare(`
      SELECT a.id
      FROM artworks a
      LEFT JOIN clip_embeddings c ON c.artwork_id = a.id
      WHERE a.iiif_url IS NOT NULL
        AND LENGTH(a.iiif_url) > 40
        AND c.artwork_id IS NULL
        AND a.id NOT IN (SELECT artwork_id FROM broken_images)
      ORDER BY CASE a.source WHEN 'nordiska' THEN 0 WHEN 'nationalmuseum' THEN 1 ELSE 2 END, a.id
    `).all() as { id: number }[];
    console.log(`   Found ${allIds.length} artworks to embed\n`);

    const selectById = db.prepare(`
      SELECT id, iiif_url FROM artworks WHERE id = ?
    `);

    const upsertEmbedding = db.prepare(
      `INSERT OR REPLACE INTO clip_embeddings (artwork_id, embedding) VALUES (?, ?)`
    );
    const updateFocal = db.prepare(
      `UPDATE artworks SET focal_x = ?, focal_y = ? WHERE id = ?`
    );
    const insertBroken = db.prepare(
      `INSERT OR IGNORE INTO broken_images (artwork_id) VALUES (?)`
    );
    const writeBatch = db.transaction((writes: EmbeddingWrite[]) => {
      for (const write of writes) {
        upsertEmbedding.run(write.id, write.embeddingBuffer);
        updateFocal.run(write.focalPoint.x, write.focalPoint.y, write.id);
      }
    });

    let processed = 0;
    let failed = 0;
    const processedIdsForNeighborRefresh: number[] = [];
    let idOffset = 0;
    let lastPctLogged = -1;
    const startTime = Date.now();

    while (idOffset < allIds.length) {
      const batchIds = allIds.slice(idOffset, idOffset + BATCH_SIZE);
      const rows = batchIds.map(({ id }) => selectById.get(id) as ArtworkRow).filter(Boolean);
      if (rows.length === 0) break;

      idOffset += BATCH_SIZE;
      const pendingWrites: EmbeddingWrite[] = [];

      for (let index = 0; index < rows.length; index += CONCURRENCY) {
        const chunk = rows.slice(index, index + CONCURRENCY);
        const results = await Promise.all(
          chunk.map(async (row) => {
            const imageUrl = externalImageUrl(row.iiif_url, IMAGE_WIDTH);

            try {
              const response = await fetchWithRetry(imageUrl);
              const arrayBuffer = await response.arrayBuffer();
              const imageBuffer = Buffer.from(arrayBuffer);

              const focalPoint = await computeFocalPoint(imageBuffer);
              const clipImage = await prepareClipInput(imageBuffer);
              const inputs = await processor(clipImage);
              const { image_embeds } = await visionModel(inputs);

              const embedding = normalize(new Float32Array(image_embeds.data));
              const embeddingBuffer = Buffer.from(
                embedding.buffer,
                embedding.byteOffset,
                embedding.byteLength
              );

              return {
                ok: true as const,
                write: {
                  id: row.id,
                  embeddingBuffer,
                  focalPoint,
                },
              };
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unknown error";
              return { ok: false as const, id: row.id, message };
            }
          })
        );

        for (const result of results) {
          if (result.ok) {
            pendingWrites.push(result.write);
            processed += 1;
            processedIdsForNeighborRefresh.push(result.write.id);
          } else {
            failed += 1;
            insertBroken.run(result.id);
            if (failed <= 10) {
              console.warn(`   ⚠️  Failed ${result.id}: ${result.message}`);
            }
          }
        }

        const pct = totalRemaining > 0
          ? ((processed / totalRemaining) * 100).toFixed(1)
          : "100.0";
        console.log(`   ${processed}/${totalRemaining} (${pct}%) [${failed} failed]`);

        const pctNum = totalRemaining > 0
          ? (processed / totalRemaining) * 100
          : 100;
        const pctWhole = Math.floor(pctNum);
        if (pctWhole > lastPctLogged) {
          lastPctLogged = pctWhole;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const rate = processed > 0 ? (processed / ((Date.now() - startTime) / 1000)).toFixed(1) : "0";
          const etaSec = processed > 0 ? Math.round(((totalRemaining - processed) / (processed / ((Date.now() - startTime) / 1000)))) : 0;
          const etaMin = Math.floor(etaSec / 60);
          const etaH = Math.floor(etaMin / 60);
          const etaStr = etaH > 0 ? `${etaH}h ${etaMin % 60}m` : `${etaMin}m`;
          const now = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
          console.log(`   [${now}] ${pctWhole}% — ${processed}/${totalRemaining} (${failed} failed) — ${rate}/s — ETA ${etaStr}`);
        }
      }

      if (pendingWrites.length > 0) {
        writeBatch(pendingWrites);
      }
    }

    if (!cleanStart && !skipNeighborRefresh) {
      console.log("\n   Refreshing related neighbors for newly embedded artworks...");
      refreshNeighborsForIds(db, processedIdsForNeighborRefresh);
    }

    console.log(`\n✅ Done. Embedded ${processed} artworks. (${failed} failed)`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("\n❌ Embedding generation failed.");
  console.error(err);
  process.exit(1);
});
