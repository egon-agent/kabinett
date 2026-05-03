import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const serviceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(serviceDir, "../..");
const sourcePath = resolve(repoRoot, process.env.SOURCE_DATABASE_PATH || "packages/data/kabinett.db");
const targetPath = resolve(
  repoRoot,
  process.env.EUROPEANA_DEMO_DATABASE_PATH || "apps/europeana-visual-service/data/europeana-demo.db",
);

const EUROPEANA_SOURCE = "europeana";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function getCreateSql(db: Database.Database, name: string): string {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(name) as { sql?: string } | undefined;
  if (!row?.sql) {
    throw new Error(`Could not find source table schema for ${name}`);
  }
  return row.sql;
}

function copyTableSchema(source: Database.Database, target: Database.Database, name: string): void {
  target.exec(getCreateSql(source, name));
}

function createIndexes(target: Database.Database): void {
  target.exec(`
    CREATE INDEX IF NOT EXISTS idx_artworks_source_inventory
      ON artworks(source, inventory_number);
    CREATE INDEX IF NOT EXISTS idx_artworks_source_iiif
      ON artworks(source, iiif_url);
    CREATE INDEX IF NOT EXISTS idx_clip_embeddings_artwork
      ON clip_embeddings(artwork_id);
    CREATE INDEX IF NOT EXISTS idx_vec_artwork_map_artwork
      ON vec_artwork_map(artwork_id);
    CREATE INDEX IF NOT EXISTS idx_artwork_neighbors_artwork
      ON artwork_neighbors(artwork_id, rank);
  `);
}

function attachSource(target: Database.Database): void {
  target.prepare("ATTACH DATABASE ? AS source").run(sourcePath);
}

function createVectorTables(target: Database.Database): void {
  sqliteVec.load(target);
  target.exec(`
    CREATE VIRTUAL TABLE vec_artworks USING vec0(embedding float[512]);
    CREATE TABLE vec_artwork_map (
      vec_rowid INTEGER PRIMARY KEY,
      artwork_id INTEGER NOT NULL
    );
  `);
}

function copyRegularTables(source: Database.Database, target: Database.Database): void {
  for (const table of ["artworks", "clip_embeddings", "broken_images", "museums", "artwork_neighbors"]) {
    copyTableSchema(source, target, table);
  }

  target.exec(`
    INSERT INTO artworks
      SELECT *
      FROM source.artworks
      WHERE source = '${EUROPEANA_SOURCE}';

    INSERT INTO clip_embeddings
      SELECT ce.*
      FROM source.clip_embeddings ce
      JOIN source.artworks a ON a.id = ce.artwork_id
      WHERE a.source = '${EUROPEANA_SOURCE}';

    INSERT INTO broken_images
      SELECT b.*
      FROM source.broken_images b
      JOIN source.artworks a ON a.id = b.artwork_id
      WHERE a.source = '${EUROPEANA_SOURCE}';

    INSERT INTO museums
      SELECT *
      FROM source.museums
      WHERE id = '${EUROPEANA_SOURCE}';

    -- Keep this table empty in the hosted demo DB. Similar works still use
    -- the CLIP centroid path, which keeps the deploy artifact much smaller.
  `);
}

function populateVectorTable(target: Database.Database): void {
  const rows = target.prepare(`
    SELECT artwork_id, embedding
    FROM clip_embeddings
    ORDER BY artwork_id
  `).all() as Array<{ artwork_id: number; embedding: Buffer }>;

  const insertVector = target.prepare("INSERT INTO vec_artworks(embedding) VALUES (?)");
  const insertMap = target.prepare("INSERT INTO vec_artwork_map(vec_rowid, artwork_id) VALUES (?, ?)");
  const insertMany = target.transaction(() => {
    for (const row of rows) {
      const result = insertVector.run(row.embedding);
      insertMap.run(Number(result.lastInsertRowid), row.artwork_id);
    }
  });

  insertMany();
}

function logCount(target: Database.Database, table: string): void {
  const count = target.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`)
    .get() as { count: number };
  console.log(`${table}: ${count.count}`);
}

mkdirSync(dirname(targetPath), { recursive: true });
rmSync(targetPath, { force: true });
rmSync(`${targetPath}-shm`, { force: true });
rmSync(`${targetPath}-wal`, { force: true });

const source = new Database(sourcePath, { readonly: true });
const target = new Database(targetPath);

try {
  attachSource(target);
  target.pragma("journal_mode = OFF");
  target.pragma("synchronous = OFF");
  target.pragma("temp_store = MEMORY");

  copyRegularTables(source, target);
  createVectorTables(target);
  populateVectorTable(target);
  createIndexes(target);

  target.exec("ANALYZE; VACUUM;");

  console.log(`Built Europeana demo database at ${targetPath}`);
  for (const table of ["artworks", "clip_embeddings", "vec_artwork_map", "broken_images", "artwork_neighbors"]) {
    logCount(target, table);
  }
} finally {
  target.close();
  source.close();
}
