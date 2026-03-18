#!/usr/bin/env python3
from __future__ import annotations

import os
import sqlite3
from pathlib import Path


def resolve_db_path() -> Path:
    env_path = os.environ.get("DATABASE_PATH")
    if env_path:
        return Path(env_path).expanduser().resolve()
    return (Path(__file__).resolve().parent.parent / "kabinett.db").resolve()


def ensure_materialized_stats_tables(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
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
        """
    )


def refresh_materialized_stats(connection: sqlite3.Connection) -> None:
    with connection:
        connection.execute("DELETE FROM source_stats_materialized")
        connection.executescript(
            """
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
            """
        )

        connection.execute("DELETE FROM source_collections_materialized")
        connection.executescript(
            """
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
            """
        )

        connection.execute(
            """
            INSERT INTO site_stats_materialized_meta (id, refreshed_at)
            VALUES (1, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET refreshed_at = excluded.refreshed_at
            """
        )


def main() -> None:
    db_path = resolve_db_path()
    connection = sqlite3.connect(str(db_path))
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA synchronous = NORMAL")

    try:
        print(f"Uppdaterar materialiserad webbplatsstatistik i {db_path}")
        ensure_materialized_stats_tables(connection)
        refresh_materialized_stats(connection)

        source_count = connection.execute(
            "SELECT COUNT(*) as c FROM source_stats_materialized"
        ).fetchone()[0]
        collection_count = connection.execute(
            "SELECT COUNT(*) as c FROM source_collections_materialized"
        ).fetchone()[0]
        refreshed_at = connection.execute(
            "SELECT refreshed_at FROM site_stats_materialized_meta WHERE id = 1"
        ).fetchone()[0]

        print(
            f"Klart. källor={source_count}, samlingar={collection_count}, refreshed_at={refreshed_at}"
        )
    finally:
        connection.close()


if __name__ == "__main__":
    main()
