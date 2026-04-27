import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import sharp from "sharp";
import { EUROPEANA_SOURCE } from "../../packages/europeana-visual-core/src/index";

const SERVICE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SERVICE_DIR, "../..");
const DB_PATH = process.env.DATABASE_PATH || resolve(REPO_ROOT, "packages/data/kabinett.db");
const COLOR_INDEX_PATH = process.env.EUROPEANA_COLOR_INDEX_PATH
  || resolve(SERVICE_DIR, ".cache/europeana-color-index.json");
const LIMIT = Number(process.env.EUROPEANA_COLOR_INDEX_LIMIT ?? "5000");
const CONCURRENCY = Math.max(1, Number(process.env.EUROPEANA_COLOR_INDEX_CONCURRENCY ?? "8"));
const FETCH_TIMEOUT_MS = Number(process.env.EUROPEANA_COLOR_INDEX_FETCH_TIMEOUT_MS ?? "12000");
const RETRIES = Math.max(0, Number(process.env.EUROPEANA_COLOR_INDEX_RETRIES ?? "2"));

type ArtworkRow = {
  artworkId: number;
  recordId: string;
  provider: string | null;
  imageUrl: string;
};

type ColorIndexRecord = {
  artworkId: number;
  recordId: string;
  provider: string | null;
  r: number;
  g: number;
  b: number;
  hex: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

async function fetchImage(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt === RETRIES) throw error;
    }

    await sleep(400 * 2 ** attempt);
  }

  throw new Error("Could not fetch image.");
}

async function extractDominantColor(row: ArtworkRow): Promise<ColorIndexRecord> {
  const buffer = await fetchImage(row.imageUrl.replace("http://", "https://"));
  const { dominant } = await sharp(buffer, { failOn: "none" }).resize(1, 1, { fit: "inside" }).stats();
  if (!dominant) throw new Error("No dominant colour returned by sharp.");

  const r = Math.round(dominant.r);
  const g = Math.round(dominant.g);
  const b = Math.round(dominant.b);
  return {
    artworkId: row.artworkId,
    recordId: row.recordId,
    provider: row.provider,
    r,
    g,
    b,
    hex: toHex(r, g, b),
  };
}

const db = new Database(DB_PATH, { readonly: true });
const limitClause = LIMIT > 0 ? "LIMIT ?" : "";
const rows = db.prepare(
  `SELECT a.id AS artworkId,
          a.inventory_number AS recordId,
          a.sub_museum AS provider,
          a.iiif_url AS imageUrl
   FROM artworks a
   JOIN vec_artwork_map map ON map.artwork_id = a.id
   WHERE a.source = ?
     AND a.inventory_number IS NOT NULL
     AND a.inventory_number != ''
     AND a.iiif_url IS NOT NULL
     AND LENGTH(a.iiif_url) > 40
     AND a.id NOT IN (SELECT artwork_id FROM broken_images)
   GROUP BY a.id
   ORDER BY a.id ASC
   ${limitClause}`
).all(...(LIMIT > 0 ? [EUROPEANA_SOURCE, LIMIT] : [EUROPEANA_SOURCE])) as ArtworkRow[];

async function main() {
  console.log("[colour-index] Building local dominant-colour index");
  console.log(`[colour-index] Database: ${DB_PATH}`);
  console.log(`[colour-index] Output: ${COLOR_INDEX_PATH}`);
  console.log(`[colour-index] Records selected: ${rows.length}`);

  const records: ColorIndexRecord[] = [];
  let processed = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index += CONCURRENCY) {
    const batch = rows.slice(index, index + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((row) => extractDominantColor(row)));

    for (const result of results) {
      processed += 1;
      if (result.status === "fulfilled") {
        records.push(result.value);
      } else {
        failed += 1;
      }
    }

    if (processed % 100 === 0 || processed === rows.length) {
      console.log(`[colour-index] ${processed}/${rows.length} processed, ${records.length} indexed, ${failed} failed`);
    }
  }

  mkdirSync(dirname(COLOR_INDEX_PATH), { recursive: true });
  writeFileSync(COLOR_INDEX_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    databasePath: DB_PATH,
    source: EUROPEANA_SOURCE,
    selected: rows.length,
    count: records.length,
    records,
  }, null, 2));

  console.log(`[colour-index] Wrote ${records.length} colour records.`);
  db.close();
}

main().catch((error) => {
  console.error("[colour-index] Failed:", error);
  db.close();
  process.exit(1);
});
