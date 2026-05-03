import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  clampVisualScore,
  EUROPEANA_SOURCE,
  matchesLocalEuropeanaFilters,
  type ColorSearchAdapter,
  type EuropeanaVisualFilters,
  type EuropeanaVisualItem,
} from "../../packages/europeana-visual-core/src/index";

const SERVICE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SERVICE_DIR, "../..");
const DB_PATH = process.env.DATABASE_PATH || resolve(REPO_ROOT, "packages/data/kabinett.db");
const COLOR_INDEX_PATH = process.env.EUROPEANA_COLOR_INDEX_PATH
  || resolve(SERVICE_DIR, ".cache/europeana-color-index.json");

type ColorIndexRecord = {
  artworkId?: number;
  recordId: string;
  provider: string | null;
  r: number;
  g: number;
  b: number;
  hex?: string;
};

type ColorIndexFile = {
  records?: ColorIndexRecord[];
};

type ColorRow = {
  artworkId: number;
  recordId: string | null;
  provider: string | null;
  r: number | null;
  g: number | null;
  b: number | null;
  hex: string | null;
};

let db: Database.Database | null = null;
let colorIndex: ColorIndexRecord[] | null = null;

function tryPragma(database: Database.Database, pragma: string): void {
  try {
    database.pragma(pragma);
  } catch (error) {
    console.warn(`[Europeana Visual] Could not apply SQLite pragma "${pragma}":`, error);
  }
}

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    tryPragma(db, "cache_size = -256000");
    tryPragma(db, "mmap_size = 1073741824");
  }
  return db;
}

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

function normalizeColorRecord(record: ColorIndexRecord): ColorIndexRecord | null {
  if (!record.recordId || !record.recordId.startsWith("/")) return null;
  if (!isByte(record.r) || !isByte(record.g) || !isByte(record.b)) return null;
  return {
    artworkId: Number.isInteger(record.artworkId) ? record.artworkId : undefined,
    recordId: record.recordId,
    provider: typeof record.provider === "string" && record.provider.trim() ? record.provider : null,
    r: record.r,
    g: record.g,
    b: record.b,
    hex: typeof record.hex === "string" ? record.hex : undefined,
  };
}

function loadDbColorRows(): ColorIndexRecord[] {
  const rows = getDb().prepare(
    `SELECT a.id AS artworkId,
            a.inventory_number AS recordId,
            a.sub_museum AS provider,
            a.color_r AS r,
            a.color_g AS g,
            a.color_b AS b,
            a.dominant_color AS hex
     FROM artworks a
     WHERE a.source = ?
       AND a.inventory_number IS NOT NULL
       AND a.inventory_number != ''
       AND a.iiif_url IS NOT NULL
       AND LENGTH(a.iiif_url) > 40
       AND a.color_r IS NOT NULL
       AND a.color_g IS NOT NULL
       AND a.color_b IS NOT NULL
       AND a.id NOT IN (SELECT artwork_id FROM broken_images)`
  ).all(EUROPEANA_SOURCE) as ColorRow[];

  return rows
    .map((row) => normalizeColorRecord({
      artworkId: row.artworkId,
      recordId: row.recordId || "",
      provider: row.provider,
      r: row.r ?? -1,
      g: row.g ?? -1,
      b: row.b ?? -1,
      hex: row.hex || undefined,
    }))
    .filter((record): record is ColorIndexRecord => Boolean(record));
}

function loadFileColorRows(): ColorIndexRecord[] {
  if (!existsSync(COLOR_INDEX_PATH)) return [];

  try {
    const parsed = JSON.parse(readFileSync(COLOR_INDEX_PATH, "utf8")) as ColorIndexFile;
    return (parsed.records || [])
      .map((record) => normalizeColorRecord(record))
      .filter((record): record is ColorIndexRecord => Boolean(record));
  } catch (error) {
    console.warn(`[Europeana Visual] Could not read colour index at ${COLOR_INDEX_PATH}:`, error);
    return [];
  }
}

function loadColorIndex(): ColorIndexRecord[] {
  if (colorIndex) return colorIndex;

  const merged = new Map<string, ColorIndexRecord>();
  for (const record of [...loadDbColorRows(), ...loadFileColorRows()]) {
    if (!merged.has(record.recordId)) {
      merged.set(record.recordId, record);
    }
  }

  colorIndex = [...merged.values()];
  return colorIndex;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function colorScore(record: ColorIndexRecord, target: { r: number; g: number; b: number }): number {
  const dr = record.r - target.r;
  const dg = record.g - target.g;
  const db = record.b - target.b;
  const distance = Math.sqrt((dr * dr) + (dg * dg) + (db * db));
  const maxDistance = Math.sqrt(3 * 255 * 255);
  return clampVisualScore(1 - (distance / maxDistance));
}

export function createSqliteColorSearch(): ColorSearchAdapter {
  return {
    async searchColor({ hex, limit, filters }: {
      hex: string;
      limit: number;
      cursor?: string | null;
      filters: EuropeanaVisualFilters;
    }): Promise<{ items: EuropeanaVisualItem[]; nextCursor: string | null; indexSize: number; engine: string }> {
      const records = loadColorIndex();
      const target = parseHex(hex);
      const bestScores = new Map<string, number>();

      for (const record of records) {
        if (!matchesLocalEuropeanaFilters(record.recordId, record.provider, filters)) continue;
        const score = colorScore(record, target);
        const current = bestScores.get(record.recordId);
        if (current === undefined || score > current) {
          bestScores.set(record.recordId, score);
        }
      }

      const items = [...bestScores.entries()]
        .map(([recordId, score]) => ({ recordId, score }))
        .sort((a, b) => b.score - a.score || a.recordId.localeCompare(b.recordId))
        .slice(0, limit);

      return {
        items,
        nextCursor: null,
        indexSize: records.length,
        engine: "local-dominant-color",
      };
    },
  };
}
