#!/bin/sh

# Decompress DB if only .gz exists (from deploy-db.sh upload)
if [ ! -f /data/kabinett.db ] && [ -f /data/kabinett.db.gz ]; then
  echo "Decompressing database..."
  gunzip -f /data/kabinett.db.gz
  rm -f /data/kabinett.db-shm /data/kabinett.db-wal
  echo "Done! Size: $(du -sh /data/kabinett.db | cut -f1)"
fi

if [ ! -f /data/kabinett.db ]; then
  echo "Database not found at /data/kabinett.db"
  if [ -n "$DB_DOWNLOAD_URL" ]; then
    echo "Downloading database from DB_DOWNLOAD_URL..."
    apt-get update -qq && apt-get install -y -qq wget > /dev/null 2>&1
    wget -q --show-progress -O /data/kabinett.db "$DB_DOWNLOAD_URL"
    echo "Download complete! Size: $(du -sh /data/kabinett.db | cut -f1)"
  else
    echo "No DB_DOWNLOAD_URL set. Using test DB as fallback."
    cp /app/test-kabinett.db /data/kabinett.db
  fi
fi

# Ensure artists table exists (for fast autocomplete)
if command -v sqlite3 > /dev/null 2>&1; then
  HAS_ARTISTS=$(sqlite3 /data/kabinett.db "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='artists';" 2>/dev/null)
  if [ "$HAS_ARTISTS" = "0" ] || [ -z "$HAS_ARTISTS" ]; then
    echo "Creating artists table..."
    sqlite3 /data/kabinett.db "
      CREATE TABLE IF NOT EXISTS artists (name TEXT NOT NULL PRIMARY KEY, artwork_count INTEGER NOT NULL DEFAULT 0);
      INSERT OR REPLACE INTO artists (name, artwork_count)
      SELECT json_extract(value, '\$.name') as name, COUNT(*) as artwork_count
      FROM artworks, json_each(artworks.artists)
      WHERE artists IS NOT NULL AND artists != '[]'
        AND json_extract(value, '\$.name') IS NOT NULL
        AND json_extract(value, '\$.name') != ''
      GROUP BY name;
    "
    echo "Artists table created: $(sqlite3 /data/kabinett.db 'SELECT count(*) FROM artists;') entries"
  fi
fi

# Build FAISS index only when explicitly enabled
FAISS_AUTO_BUILD="${FAISS_AUTO_BUILD:-0}"
if [ -f /data/kabinett.db ] && [ ! -f /data/faiss.index ] && [ "$FAISS_AUTO_BUILD" = "1" ]; then
  echo "Building FAISS index (FAISS_AUTO_BUILD=1)..."
  PYTHONUNBUFFERED=1 python3 /app/packages/data/scripts/build-faiss-index.py \
    --db /data/kabinett.db \
    --out-index /data/faiss.index \
    --out-map /data/faiss-map.bin
  echo "FAISS index built!"
elif [ ! -f /data/faiss.index ] || [ ! -f /data/faiss-map.bin ]; then
  echo "FAISS index missing; skipping auto-build and continuing without FAISS."
fi

# Start FAISS KNN server as a sibling process (not child of this shell)
# Using nohup + disown pattern so it survives the exec below
if [ -f /data/faiss.index ] && [ -f /data/faiss-map.bin ]; then
  echo "Starting FAISS server..."
  PYTHONUNBUFFERED=1 nohup python3 /app/packages/data/scripts/faiss-server.py > /data/faiss-server.log 2>&1 &
  echo "FAISS server starting in background (PID $!), Node will retry connections..."
fi

if command -v sqlite3 > /dev/null 2>&1; then
  HAS_MEDIA_LICENSE=$(sqlite3 /data/kabinett.db "SELECT count(*) FROM pragma_table_info('artworks') WHERE name='media_license';" 2>/dev/null)
  MEDIA_LICENSE_FILTER=""

  if [ "$HAS_MEDIA_LICENSE" = "1" ]; then
    echo "Ensuring media license index..."
    sqlite3 /data/kabinett.db "CREATE INDEX IF NOT EXISTS idx_artworks_media_license ON artworks(media_license);" 2>/dev/null || true
    MEDIA_LICENSE_FILTER="AND (a.media_license IS NULL OR a.media_license NOT IN ('In Copyright', '© Bildupphovsrätt i Sverige'))"
  fi

  echo "Refreshing top_artists_materialized..."
  sqlite3 /data/kabinett.db <<SQL
DROP TABLE IF EXISTS top_artists_materialized;
CREATE TABLE top_artists_materialized (
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  artwork_count INTEGER NOT NULL,
  sample_artwork_id INTEGER,
  PRIMARY KEY (source, name)
);
WITH enabled_museums AS (
  SELECT id
  FROM museums
  WHERE enabled = 1
), artist_counts AS (
  SELECT
    a.source,
    json_extract(a.artists, '\$[0].name') AS name,
    COUNT(*) AS artwork_count
  FROM artworks a
  JOIN enabled_museums em ON em.id = a.source
  WHERE a.artists IS NOT NULL
    AND json_extract(a.artists, '\$[0].name') IS NOT NULL
    AND json_extract(a.artists, '\$[0].name') NOT LIKE '%känd%'
    AND json_extract(a.artists, '\$[0].name') NOT LIKE '%nonym%'
    AND json_extract(a.artists, '\$[0].name') NOT LIKE 'http://%'
    AND json_extract(a.artists, '\$[0].name') NOT LIKE 'https://%'
    AND json_extract(a.artists, '\$[0].name') NOT LIKE 'www.%'
    AND json_extract(a.artists, '\$[0].name') NOT GLOB '[0-9]*_*'
    AND json_extract(a.artists, '\$[0].name') NOT IN ('Gustavsberg')
    AND COALESCE(a.category, '') NOT LIKE '%Keramik%'
    AND COALESCE(a.category, '') NOT LIKE '%Porslin%'
    AND COALESCE(a.category, '') NOT LIKE '%Glas%'
    AND COALESCE(a.category, '') NOT LIKE '%Formgivning%'
    AND a.iiif_url IS NOT NULL
    AND LENGTH(a.iiif_url) > 40
    ${MEDIA_LICENSE_FILTER}
  GROUP BY a.source, name
), artist_samples AS (
  SELECT
    a.source,
    json_extract(a.artists, '\$[0].name') AS name,
    MAX(a.id) AS sample_id
  FROM artworks a
  JOIN enabled_museums em ON em.id = a.source
  LEFT JOIN broken_images bi ON bi.artwork_id = a.id
  WHERE a.artists IS NOT NULL
    AND json_extract(a.artists, '\$[0].name') IS NOT NULL
    AND json_extract(a.artists, '\$[0].name') NOT LIKE '%känd%'
    AND json_extract(a.artists, '\$[0].name') NOT LIKE '%nonym%'
    AND json_extract(a.artists, '\$[0].name') NOT LIKE 'http://%'
    AND json_extract(a.artists, '\$[0].name') NOT LIKE 'https://%'
    AND json_extract(a.artists, '\$[0].name') NOT LIKE 'www.%'
    AND json_extract(a.artists, '\$[0].name') NOT GLOB '[0-9]*_*'
    AND json_extract(a.artists, '\$[0].name') NOT IN ('Gustavsberg')
    AND COALESCE(a.category, '') NOT LIKE '%Keramik%'
    AND COALESCE(a.category, '') NOT LIKE '%Porslin%'
    AND COALESCE(a.category, '') NOT LIKE '%Glas%'
    AND COALESCE(a.category, '') NOT LIKE '%Formgivning%'
    AND a.iiif_url IS NOT NULL
    AND LENGTH(a.iiif_url) > 40
    AND bi.artwork_id IS NULL
    ${MEDIA_LICENSE_FILTER}
  GROUP BY a.source, name
)
INSERT INTO top_artists_materialized (source, name, artwork_count, sample_artwork_id)
SELECT c.source, c.name, c.artwork_count, s.sample_id
FROM artist_counts c
JOIN artist_samples s
  ON s.source = c.source
 AND s.name = c.name
WHERE s.sample_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_top_artists_materialized_source_count ON top_artists_materialized(source, artwork_count DESC);
CREATE INDEX IF NOT EXISTS idx_top_artists_materialized_name ON top_artists_materialized(name);
SQL

  echo "top_artists_materialized refreshed: $(sqlite3 /data/kabinett.db 'SELECT COUNT(*) FROM top_artists_materialized;' 2>/dev/null || echo 0) rows"
fi

echo "Starting Kabinett..."
cd /app/apps/web || exit 1

forward_signal() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}

trap forward_signal INT TERM

npx react-router-serve ./build/server/index.js &
SERVER_PID=$!

if command -v curl > /dev/null 2>&1; then
  SERVER_URL="http://127.0.0.1:${PORT:-3000}"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      wait "$SERVER_PID"
      exit $?
    fi

    if curl -fsS "$SERVER_URL/" > /dev/null 2>&1; then
      break
    fi

    sleep 1
  done

  echo "Pre-warming key routes..."
  curl -fsS "$SERVER_URL/" > /dev/null 2>&1 || true
  curl -fsS "$SERVER_URL/discover" > /dev/null 2>&1 || true
fi

wait "$SERVER_PID"
