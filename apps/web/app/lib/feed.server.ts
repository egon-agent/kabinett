import { getDb } from "./db.server";
import { buildImageUrl } from "./images";
import { getEnabledMuseums, sourceFilter } from "./museums.server";
import { searchArtworksText } from "./text-search.server";

type FeedItemRow = {
  id: number;
  title_sv: string | null;
  title_en?: string | null;
  artists: string | null;
  dating_text: string | null;
  iiif_url: string;
  dominant_color: string | null;
  category: string | null;
  technique_material: string | null;
  museum_name: string | null;
  focal_x: number | null;
  focal_y: number | null;
  descriptions_sv?: string | null;
};

export type FeedItem = {
  id: number;
  title_sv: string | null;
  title_en?: string | null;
  artists: string | null;
  dating_text: string | null;
  iiif_url: string;
  dominant_color: string | null;
  category: string | null;
  technique_material: string | null;
  imageUrl: string;
  museum_name: string | null;
  focal_x: number | null;
  focal_y: number | null;
};

const COLOR_TARGETS: Record<string, { r: number; g: number; b: number }> = {
  red: { r: 160, g: 48, b: 40 },
  blue: { r: 40, g: 80, b: 140 },
};

const CENTURIES: Record<string, { from: number; to: number }> = {
  "1600-tal": { from: 1600, to: 1699 },
  "1700-tal": { from: 1700, to: 1799 },
  "1800-tal": { from: 1800, to: 1899 },
};

const CATEGORY_FILTERS = new Set(["Målningar", "Skulptur", "Porträtt", "Landskap"]);

const MOOD_QUERIES: Record<string, { fts: string }> = {
  Djur: {
    fts: 'title_sv:"djur"* OR title_en:"animal"* OR title_sv:"hund"* OR title_en:"dog"* OR title_sv:"katt"* OR title_en:"cat"* OR title_sv:"fågel"* OR title_en:"bird"* OR title_sv:"häst"* OR title_en:"horse"*',
  },
  Havet: {
    fts: 'title_sv:"hav"* OR title_en:"sea"* OR title_sv:"sjö"* OR title_en:"lake"* OR title_sv:"vatten"* OR title_en:"water"* OR title_sv:"kust"* OR title_en:"coast"* OR title_sv:"strand"* OR title_en:"shore"* OR title_sv:"skepp"* OR title_en:"ship"* OR title_sv:"båt"* OR title_en:"boat"*',
  },
  Blommor: {
    fts: 'title_sv:"blomma"* OR title_sv:"blommor"* OR title_sv:"blomster"* OR title_en:"flower"* OR title_en:"flowers"* OR title_sv:"ros"* OR title_en:"rose"* OR title_sv:"tulpan"* OR title_en:"tulip"* OR title_sv:"bukett"* OR title_en:"bouquet"*',
  },
  Natt: {
    fts: 'title_sv:"natt"* OR title_en:"night"* OR title_sv:"kväll"* OR title_en:"evening"* OR title_sv:"skymning"* OR title_en:"dusk"* OR title_sv:"måne"* OR title_en:"moon"*',
  },
};

function isKnownFeedFilter(filter: string): boolean {
  return filter === "Alla"
    || CATEGORY_FILTERS.has(filter)
    || filter === "Rött"
    || filter === "Blått"
    || Boolean(CENTURIES[filter])
    || Boolean(MOOD_QUERIES[filter]);
}

function mapRows(rows: FeedItemRow[]): FeedItem[] {
  return rows.map((row) => ({
    id: row.id,
    title_sv: row.title_sv || row.title_en || "Utan titel",
    title_en: row.title_en || null,
    artists: row.artists,
    dating_text: row.dating_text || "",
    iiif_url: row.iiif_url,
    dominant_color: row.dominant_color || "#1A1815",
    category: row.category,
    technique_material: row.technique_material,
    imageUrl: buildImageUrl(row.iiif_url, 400),
    museum_name: row.museum_name,
    focal_x: row.focal_x,
    focal_y: row.focal_y,
  }));
}

const ALLA_MEDIA_LICENSE_SQL = "(a.media_license IS NULL OR a.media_license NOT IN ('In Copyright', '© Bildupphovsrätt i Sverige'))";
const ALLA_FETCH_ATTEMPTS = 3;

function interleaveRowsRoundRobin(groups: FeedItemRow[][], targetCount: number): FeedItemRow[] {
  const merged: FeedItemRow[] = [];
  const seen = new Set<string>();
  const positions = new Array(groups.length).fill(0);

  while (merged.length < targetCount) {
    let addedInPass = false;

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      if (!group) continue;

      while (positions[groupIndex] < group.length) {
        const row = group[positions[groupIndex]++];
        if (!row) break;

        if (row.iiif_url && seen.has(row.iiif_url)) {
          continue;
        }

        if (row.iiif_url) {
          seen.add(row.iiif_url);
        }

        merged.push(row);
        addedInPass = true;
        break;
      }

      if (merged.length >= targetCount) {
        break;
      }
    }

    if (!addedInPass) {
      break;
    }
  }

  return merged;
}

function queryAllaRowsPerMuseum(
  targetCount: number,
  limit: number,
  applyMediaLicenseFilter: boolean,
): { rows: FeedItemRow[]; hasMore: boolean } {
  const museums = getEnabledMuseums();
  if (museums.length === 0) {
    return { rows: [], hasMore: false };
  }

  const db = getDb();
  const sql = `SELECT a.id, a.title_sv, a.title_en, a.artists, a.dating_text, a.iiif_url, a.dominant_color, a.category, a.technique_material,
                      a.focal_x, a.focal_y,
                      COALESCE(a.sub_museum, m.name) as museum_name
               FROM artworks a
               LEFT JOIN museums m ON m.id = a.source
               LEFT JOIN broken_images bi ON bi.artwork_id = a.id
               WHERE a.source = ?
                 AND a.iiif_url IS NOT NULL
                 AND LENGTH(a.iiif_url) > 40
                 AND bi.artwork_id IS NULL
                 AND LENGTH(COALESCE(a.title_sv, a.title_en, '')) < 60
                 ${applyMediaLicenseFilter ? `AND ${ALLA_MEDIA_LICENSE_SQL}` : ""}
               ORDER BY a.id DESC
               LIMIT ?`;
  const stmt = db.prepare(sql);

  let perSourceLimit = Math.max(limit * 2, Math.ceil(targetCount / museums.length) * 2);
  let mergedRows: FeedItemRow[] = [];
  let hasMore = false;

  for (let attempt = 0; attempt < ALLA_FETCH_ATTEMPTS; attempt += 1) {
    const groups = museums.map((museumId) => stmt.all(museumId, perSourceLimit) as FeedItemRow[]);
    mergedRows = interleaveRowsRoundRobin(groups, targetCount);

    const couldHaveMore = groups.some((rows) => rows.length === perSourceLimit);
    hasMore = mergedRows.length >= targetCount || couldHaveMore;

    if (mergedRows.length >= targetCount || !couldHaveMore) {
      break;
    }

    perSourceLimit *= 2;
  }

  return { rows: mergedRows, hasMore };
}

export async function fetchFeed(options: {
  cursor?: number | null;
  limit: number;
  filter: string;
}) {
  const db = getDb();
  const sourceA = sourceFilter("a");
  const limit = Math.max(1, Math.min(options.limit, 40));
  const filter = options.filter?.trim() || "Alla";
  const cursor = options.cursor ?? null;
  const applyMediaLicenseFilter = sourceA.sql.includes("media_license");

  if (MOOD_QUERIES[filter]) {
    const mood = MOOD_QUERIES[filter];
    const offset = Math.max(0, cursor || 0);
    let rows: FeedItemRow[];
    try {
    // Fetch extra rows and dedupe in JS to avoid expensive window function
    const overFetch = (limit + offset) * 3;
    const rawRows = db
      .prepare(
        `SELECT a.id, a.title_sv, a.title_en, a.artists, a.dating_text, a.iiif_url, a.dominant_color, a.category, a.technique_material,
                a.focal_x, a.focal_y,
                COALESCE(a.sub_museum, m.name) as museum_name,
                artworks_fts.rank as relevance
         FROM artworks_fts
         JOIN artworks a ON a.id = artworks_fts.rowid
         LEFT JOIN museums m ON m.id = a.source
         WHERE artworks_fts MATCH ?
           AND a.iiif_url IS NOT NULL
           AND LENGTH(a.iiif_url) > 40
           AND LENGTH(COALESCE(a.title_sv, a.title_en, '')) <= 140
           AND a.id NOT IN (SELECT artwork_id FROM broken_images)
           AND ${sourceA.sql}
         ORDER BY artworks_fts.rank ASC, a.id DESC
         LIMIT ?`
      )
      .all(mood.fts, ...sourceA.params, overFetch) as (FeedItemRow & { relevance: number })[];
    const seen = new Set<string>();
    const deduped: FeedItemRow[] = [];
    for (const row of rawRows) {
      if (row.iiif_url && seen.has(row.iiif_url)) continue;
      if (row.iiif_url) seen.add(row.iiif_url);
      deduped.push(row);
    }
    rows = deduped.slice(offset, offset + limit);
    } catch (err) {
      console.error("FTS mood query failed (artworks_fts may be missing):", err);
      rows = [];
    }

    return {
      items: mapRows(rows),
      nextCursor: offset + rows.length,
      hasMore: rows.length === limit,
      mode: "offset" as const,
    };
  }

  if (!isKnownFeedFilter(filter)) {
    const offset = Math.max(0, cursor || 0);
    const rows = searchArtworksText({
      db,
      query: filter,
      source: sourceA,
      limit,
      offset,
      scope: "broad",
    }) as FeedItemRow[];

    return {
      items: mapRows(rows),
      nextCursor: offset + rows.length,
      hasMore: rows.length === limit,
      mode: "offset" as const,
    };
  }

  const baseConditions: string[] = [
    "a.iiif_url IS NOT NULL",
    "LENGTH(a.iiif_url) > 40",
    "a.id NOT IN (SELECT artwork_id FROM broken_images)",
    "LENGTH(COALESCE(a.title_sv, a.title_en, '')) < 60",
    sourceA.sql,
  ];
  const baseParams: Array<string | number> = [...sourceA.params];
  const cursorConditions: string[] = [];
  const cursorParams: Array<string | number> = [];
  const tablePrefix = "artworks a";
  let dedupeOrderBy = "a.id ASC";

  if (filter === "Alla") {
    const offset = Math.max(0, cursor || 0);
    const { rows: mergedRows, hasMore } = queryAllaRowsPerMuseum(
      offset + limit + 1,
      limit,
      applyMediaLicenseFilter,
    );
    const rows = mergedRows.slice(offset, offset + limit);
    const pageHasMore = hasMore && rows.length > 0;
    const nextCursor = pageHasMore ? offset + rows.length : null;

    return {
      items: mapRows(rows),
      nextCursor,
      hasMore: pageHasMore,
      mode: "cursor" as const,
    };
  }

  if (CATEGORY_FILTERS.has(filter)) {
    baseConditions.push("a.category LIKE ?");
    baseParams.push(`%${filter}%`);
  }

  if (filter === "Rött" || filter === "Blått") {
    const colorKey = filter === "Rött" ? "red" : "blue";
    const color = COLOR_TARGETS[colorKey];
    const colorDistance = `ABS(a.color_r - ${color.r}) + ABS(a.color_g - ${color.g}) + ABS(a.color_b - ${color.b})`;
    baseConditions.push("a.color_r IS NOT NULL", "a.color_g IS NOT NULL", "a.color_b IS NOT NULL");
    if (filter === "Rött") {
      baseConditions.push("a.color_r >= a.color_g + 18", "a.color_r >= a.color_b + 18");
    } else {
      baseConditions.push("a.color_b >= a.color_r + 16", "a.color_b >= a.color_g + 8");
    }
    dedupeOrderBy = `${colorDistance} ASC, a.id DESC`;
  }

  const century = CENTURIES[filter];
  if (century) {
    baseConditions.push("a.year_start >= ? AND a.year_start <= ?");
    baseParams.push(century.from, century.to);
  }

  if (cursor) {
    cursorConditions.push("id > ?");
    cursorParams.push(cursor);
  }

  const baseWhere = baseConditions.join(" AND ");
  const fromClause = tablePrefix;
  const cursorWhere = cursorConditions.length > 0 ? ` AND ${cursorConditions.join(" AND ")}` : "";

  // Fetch more than needed, dedupe in JS to avoid expensive window function
  const overFetchLimit = limit * 3;
  const rawRows = db
    .prepare(
      `SELECT a.id, a.title_sv, a.title_en, a.artists, a.dating_text, a.iiif_url, a.dominant_color, a.category, a.technique_material,
              a.focal_x, a.focal_y,
              COALESCE(a.sub_museum, m.name) as museum_name
       FROM ${fromClause}
       LEFT JOIN museums m ON m.id = a.source
       WHERE ${baseWhere}${cursorWhere}
       ORDER BY ${dedupeOrderBy}
       LIMIT ?`
    )
    .all(...baseParams, ...cursorParams, overFetchLimit) as FeedItemRow[];

  // Deduplicate by iiif_url in JS
  const seen = new Set<string>();
  const rows: FeedItemRow[] = [];
  for (const row of rawRows) {
    if (row.iiif_url && seen.has(row.iiif_url)) continue;
    if (row.iiif_url) seen.add(row.iiif_url);
    rows.push(row);
    if (rows.length >= limit) break;
  }

  const nextCursor = rows.length > 0 ? rows[rows.length - 1].id : cursor;

  return {
    items: mapRows(rows),
    nextCursor,
    hasMore: rows.length === limit,
    mode: "cursor" as const,
  };
}
