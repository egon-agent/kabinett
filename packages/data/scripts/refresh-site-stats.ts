import Database from "better-sqlite3";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || resolve(__dirname, "../kabinett.db");

function ensureMaterializedStatsTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_stats_materialized (
      source TEXT PRIMARY KEY,
      total_works INTEGER NOT NULL,
      paintings INTEGER NOT NULL,
      min_year INTEGER,
      max_year INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_collections_materialized (
      source TEXT NOT NULL,
      collection_name TEXT NOT NULL,
      PRIMARY KEY (source, collection_name)
    );

    CREATE TABLE IF NOT EXISTS site_stats_materialized_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      refreshed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_source_collections_materialized_source
      ON source_collections_materialized(source);
  `);
}

function refreshMaterializedStats(db: Database.Database): void {
  const run = db.transaction(() => {
    db.prepare("DELETE FROM source_stats_materialized").run();
    db.exec(`
      INSERT INTO source_stats_materialized (
        source,
        total_works,
        paintings,
        min_year,
        max_year,
        updated_at
      )
      SELECT
        source,
        COUNT(*) as total_works,
        SUM(CASE WHEN category LIKE '%Måleri%' THEN 1 ELSE 0 END) as paintings,
        MIN(CASE WHEN year_start > 0 THEN year_start END) as min_year,
        MAX(CASE WHEN year_start > 0 THEN COALESCE(year_end, year_start) END) as max_year,
        datetime('now') as updated_at
      FROM artworks
      WHERE source IS NOT NULL
        AND source != ''
      GROUP BY source;
    `);

    db.prepare("DELETE FROM source_collections_materialized").run();
    db.exec(`
      INSERT INTO source_collections_materialized (source, collection_name)
      SELECT
        a.source,
        COALESCE(a.sub_museum, m.name) as collection_name
      FROM artworks a
      LEFT JOIN museums m ON m.id = a.source
      WHERE a.source IS NOT NULL
        AND a.source != ''
        AND COALESCE(a.sub_museum, m.name) IS NOT NULL
        AND COALESCE(a.sub_museum, m.name) != 'Statens historiska museer'
      GROUP BY a.source, collection_name;
    `);

    db.prepare(`
      INSERT INTO site_stats_materialized_meta (id, refreshed_at)
      VALUES (1, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET refreshed_at = excluded.refreshed_at
    `).run();
  });

  run();
}

function main(): void {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  try {
    console.log(`Refreshing materialized site stats in ${DB_PATH}`);
    ensureMaterializedStatsTables(db);
    refreshMaterializedStats(db);

    const sourceCount = (db.prepare("SELECT COUNT(*) as c FROM source_stats_materialized").get() as { c: number }).c;
    const collectionCount = (db.prepare("SELECT COUNT(*) as c FROM source_collections_materialized").get() as { c: number }).c;
    const refreshedAt = (db.prepare("SELECT refreshed_at FROM site_stats_materialized_meta WHERE id = 1").get() as { refreshed_at: string }).refreshed_at;

    console.log(`Done. sources=${sourceCount}, collections=${collectionCount}, refreshed_at=${refreshedAt}`);
  } finally {
    db.close();
  }
}

main();
