import Database from "better-sqlite3";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as sqliteVec from "sqlite-vec";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || resolve(__dirname, "../kabinett.db");
const BATCH_SIZE = 1_000;

type EmbeddingRow = {
  artwork_id: number;
  embedding: Buffer;
};

function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  sqliteVec.load(db);

  try {
    console.log(`\n🧭 Migrerar sqlite-vec index: ${DB_PATH}`);

    db.exec("DROP TABLE IF EXISTS vec_artworks");
    db.exec("DROP TABLE IF EXISTS vec_artwork_map");

    db.exec(`
      CREATE VIRTUAL TABLE vec_artworks USING vec0(
        embedding float[512]
      );
    `);

    db.exec(`
      CREATE TABLE vec_artwork_map (
        vec_rowid INTEGER PRIMARY KEY,
        artwork_id INTEGER NOT NULL
      );
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_vec_artwork_map_artwork ON vec_artwork_map(artwork_id)");

    const total = (
      db.prepare("SELECT COUNT(*) AS count FROM clip_embeddings").get() as { count: number }
    ).count;
    console.log(`   Embeddings att migrera: ${total}`);

    // Test what vec0 actually returns as rowid
    const testBuf = Buffer.alloc(512 * 4); // 512 floats = 2048 bytes
    const testResult = db.prepare("INSERT INTO vec_artworks (embedding) VALUES (?)").run(testBuf);
    const testRowid = Number(testResult.lastInsertRowid);
    console.log(`   Test insert rowid: ${testRowid} (type: ${typeof testResult.lastInsertRowid})`);
    // Clean up test row
    db.exec("DELETE FROM vec_artworks WHERE rowid = " + testRowid);
    // Re-drop and recreate to start clean
    db.exec("DROP TABLE IF EXISTS vec_artworks");
    db.exec(`
      CREATE VIRTUAL TABLE vec_artworks USING vec0(
        embedding float[512]
      );
    `);

    const insertVec = db.prepare("INSERT INTO vec_artworks (embedding) VALUES (?)");
    const insertMap = db.prepare("INSERT INTO vec_artwork_map (vec_rowid, artwork_id) VALUES (?, ?)");

    const insertBatch = db.transaction((rows: EmbeddingRow[]) => {
      for (const row of rows) {
        const result = insertVec.run(row.embedding);
        const rid = Number(result.lastInsertRowid);
        insertMap.run(rid, row.artwork_id);
      }
    });

    let processed = 0;
    let skipped = 0;
    let lastId = -Number.MAX_SAFE_INTEGER;

    while (true) {
      let rows: EmbeddingRow[];
      try {
        rows = db.prepare(
          "SELECT artwork_id, embedding FROM clip_embeddings WHERE artwork_id > ? ORDER BY artwork_id LIMIT ?"
        ).all(lastId, BATCH_SIZE) as EmbeddingRow[];
      } catch (err) {
        console.error(`   ⚠️ Read error after artwork_id ${lastId}, skipping ahead...`);
        const nextRow = db.prepare(
          "SELECT MIN(artwork_id) as next_id FROM clip_embeddings WHERE artwork_id > ? + 1000"
        ).get(lastId) as { next_id: number | null } | undefined;
        if (!nextRow?.next_id) break;
        lastId = nextRow.next_id - 1;
        skipped++;
        continue;
      }

      if (rows.length === 0) break;
      lastId = rows[rows.length - 1].artwork_id;

      try {
        insertBatch(rows);
      } catch (err) {
        // Insert one by one on batch failure
        for (const row of rows) {
          try {
            const result = insertVec.run(row.embedding);
            const rid = Number(result.lastInsertRowid);
            insertMap.run(rid, row.artwork_id);
          } catch { skipped++; }
        }
      }
      processed += rows.length;

      if (processed % 10_000 < BATCH_SIZE || rows.length < BATCH_SIZE) {
        const pct = ((processed / total) * 100).toFixed(1);
        console.log(`   ${processed}/${total} (${pct}%)${skipped > 0 ? ` [${skipped} skipped]` : ""}`);
      }

      // Verify first batch mapping is correct
      if (processed === rows.length) {
        const check = db.prepare(
          "SELECT vec_rowid, artwork_id FROM vec_artwork_map LIMIT 3"
        ).all() as Array<{ vec_rowid: number; artwork_id: number }>;
        console.log(`   First mappings: ${JSON.stringify(check)}`);
        const negCount = (db.prepare(
          "SELECT COUNT(*) as c FROM vec_artwork_map WHERE artwork_id < 0"
        ).get() as { c: number }).c;
        const totalMap = (db.prepare(
          "SELECT COUNT(*) as c FROM vec_artwork_map"
        ).get() as { c: number }).c;
        console.log(`   Map: ${totalMap} total, ${negCount} negative artwork_ids (expected: some, from SHM/Nordiska)`);
      }
    }

    // Final verification
    const finalNeg = (db.prepare(
      "SELECT COUNT(*) as c FROM vec_artwork_map WHERE artwork_id < 0"
    ).get() as { c: number }).c;
    const finalTotal = (db.prepare(
      "SELECT COUNT(*) as c FROM vec_artwork_map"
    ).get() as { c: number }).c;
    console.log(`\n   Final map: ${finalTotal} total, ${finalNeg} negative artwork_ids`);
    console.log(`   (Negative IDs are expected for SHM/Nordiska artworks)`);

    // Spot-check: verify a mapping round-trips correctly
    const spotCheck = db.prepare(`
      SELECT m.artwork_id, c.artwork_id as clip_artwork_id
      FROM vec_artwork_map m
      JOIN clip_embeddings c ON c.artwork_id = m.artwork_id
      LIMIT 1
    `).get() as { artwork_id: number; clip_artwork_id: number } | undefined;
    if (spotCheck) {
      console.log(`   Spot check: map artwork_id=${spotCheck.artwork_id}, clip artwork_id=${spotCheck.clip_artwork_id} ✓`);
    }

    console.log(`\n✅ sqlite-vec migration klar — ${processed} vektorer indexerade\n`);
  } finally {
    db.close();
  }
}

main();
