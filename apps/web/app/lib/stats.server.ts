import type Database from "better-sqlite3";
import { getCollectionOptions, sourceFilter } from "./museums.server";

export type SiteStats = {
  totalWorks: number;
  museums: number;
  paintings: number;
  minYear: number | null;
  maxYear: number | null;
  yearsSpan: number;
};

const statsCache = new Map<string, { stats: SiteStats; ts: number }>();
const STATS_CACHE_TTL_MS = 300_000;
let hasMaterializedStatsTables: boolean | null = null;

function querySiteStatsLive(db: Database.Database): SiteStats {
  const source = sourceFilter();
  const minYear = (db.prepare(`SELECT MIN(year_start) as c FROM artworks WHERE year_start > 0 AND ${source.sql}`).get(...source.params) as any).c as number | null;
  const currentYear = new Date().getFullYear();
  const maxYear = (db.prepare(`SELECT MAX(COALESCE(year_end, year_start)) as c FROM artworks WHERE year_start > 0 AND ${source.sql}`).get(...source.params) as any).c as number | null;

  return {
    totalWorks: (db.prepare(`SELECT COUNT(*) as c FROM artworks WHERE ${source.sql}`).get(...source.params) as any).c as number,
    museums: getCollectionOptions().length,
    paintings: (db.prepare(`SELECT COUNT(*) as c FROM artworks WHERE category LIKE '%Måleri%' AND ${source.sql}`).get(...source.params) as any).c as number,
    minYear,
    maxYear,
    yearsSpan: minYear ? Math.max(0, currentYear - minYear) : 0,
  };
}

function materializedStatsTablesExist(db: Database.Database): boolean {
  if (hasMaterializedStatsTables !== null) return hasMaterializedStatsTables;

  const rows = db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('source_stats_materialized', 'source_collections_materialized', 'site_stats_materialized_meta')`
    )
    .all() as Array<{ name: string }>;

  if (rows.length !== 3) {
    hasMaterializedStatsTables = false;
    return hasMaterializedStatsTables;
  }

  const meta = db
    .prepare("SELECT refreshed_at FROM site_stats_materialized_meta WHERE id = 1")
    .get() as { refreshed_at?: string } | undefined;

  hasMaterializedStatsTables = Boolean(meta?.refreshed_at);
  return hasMaterializedStatsTables;
}

function querySiteStatsMaterialized(db: Database.Database): SiteStats {
  const source = sourceFilter();
  const currentYear = new Date().getFullYear();

  if (source.params.length === 0) {
    return {
      totalWorks: 0,
      museums: 0,
      paintings: 0,
      minYear: null,
      maxYear: null,
      yearsSpan: 0,
    };
  }

  const placeholders = source.params.map(() => "?").join(",");
  const summary = db.prepare(
    `SELECT
       COALESCE(SUM(total_works), 0) as total_works,
       COALESCE(SUM(paintings), 0) as paintings,
       MIN(min_year) as min_year,
       MAX(max_year) as max_year
     FROM source_stats_materialized
     WHERE source IN (${placeholders})`
  ).get(...source.params) as {
    total_works: number;
    paintings: number;
    min_year: number | null;
    max_year: number | null;
  };

  return {
    totalWorks: summary.total_works,
    museums: getCollectionOptions().length,
    paintings: summary.paintings,
    minYear: summary.min_year,
    maxYear: summary.max_year,
    yearsSpan: summary.min_year ? Math.max(0, currentYear - summary.min_year) : 0,
  };
}

function querySiteStats(db: Database.Database): SiteStats {
  if (!materializedStatsTablesExist(db)) {
    return querySiteStatsLive(db);
  }

  try {
    return querySiteStatsMaterialized(db);
  } catch {
    return querySiteStatsLive(db);
  }
}

export function getSiteStats(db: Database.Database): SiteStats {
  return querySiteStats(db);
}

export function getCachedSiteStats(db: Database.Database): SiteStats {
  const now = Date.now();
  const cacheKey = sourceFilter().params.join(",") || "__all__";
  const cached = statsCache.get(cacheKey);
  if (cached && now - cached.ts < STATS_CACHE_TTL_MS) {
    return cached.stats;
  }
  const stats = querySiteStats(db);
  statsCache.set(cacheKey, { stats, ts: now });
  return stats;
}
