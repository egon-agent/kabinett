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
echo "Starting Kabinett..."
cd /app/apps/web && exec npx react-router-serve ./build/server/index.js
