import { getDb } from "./db.server";
import { clipSearch, clipSearchFromSeedIds } from "./clip-search.server";
import { colourPaletteSearch, hydrateEuropeanaRecords } from "./europeana-api.server";
import {
  clampVisualScore,
  coerceLimit,
  decodeVisualCursor,
  demoCorpusMeta,
  encodeVisualCursor,
  EUROPEANA_SOURCE,
  type EuropeanaHydratedRecord,
  type EuropeanaVisualFilters,
  type EuropeanaVisualItem,
  type EuropeanaVisualResponse,
  matchesLocalEuropeanaFilters,
  normalizeHexColor,
  normalizeRecordId,
} from "./europeana-visual.shared";

type ClipCandidate = {
  id: number;
  similarity: number;
};

type LocalArtworkRow = {
  id: number;
  inventory_number: string;
  sub_museum: string | null;
};

type NeighborRow = {
  id: number;
  distance: number | null;
};

const MAX_LOCAL_WINDOW = Number(process.env.EUROPEANA_VISUAL_MAX_WINDOW ?? "480");
const LOCAL_SEARCH_FETCH_FLOOR = Number(process.env.EUROPEANA_VISUAL_FETCH_FLOOR ?? "72");
const LOCAL_SEARCH_VARIANT = process.env.EUROPEANA_VISUAL_VARIANT_MODE === "strict"
  ? "strict"
  : process.env.EUROPEANA_VISUAL_VARIANT_MODE === "balanced"
    ? "balanced"
    : "expanded";
const LOCAL_SIMILAR_OVERFETCH = Number(process.env.EUROPEANA_VISUAL_SIMILAR_OVERFETCH ?? "72");
const LOCAL_HYDRATE_LIMIT = Number(process.env.EUROPEANA_VISUAL_HYDRATE_LIMIT ?? "24");

function getLocalRowsByIds(ids: number[]): Map<number, LocalArtworkRow> {
  const uniqueIds = [...new Set(ids)].filter((id) => Number.isInteger(id));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const db = getDb();
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT id, inventory_number, sub_museum
     FROM artworks
     WHERE source = ?
       AND id IN (${placeholders})`
  ).all(EUROPEANA_SOURCE, ...uniqueIds) as LocalArtworkRow[];

  return new Map(rows.map((row) => [row.id, row]));
}

function getArtworkIdsForRecordId(recordId: string): number[] {
  const normalizedRecordId = normalizeRecordId(recordId);
  if (!normalizedRecordId) return [];

  const db = getDb();
  const rows = db.prepare(
    `SELECT id
     FROM artworks
     WHERE source = ?
       AND inventory_number = ?`
  ).all(EUROPEANA_SOURCE, normalizedRecordId) as Array<{ id: number }>;

  return rows.map((row) => row.id);
}

function scoreFromNeighborDistance(distance: number | null): number {
  if (!Number.isFinite(distance ?? Number.NaN)) return 0;
  return clampVisualScore(1 / (1 + Math.max(0, Number(distance))));
}

function dedupeCandidates(
  candidates: Array<{ recordId: string; provider: string | null; score: number }>,
  filters: EuropeanaVisualFilters,
): EuropeanaVisualItem[] {
  const bestScores = new Map<string, number>();

  for (const candidate of candidates) {
    if (!matchesLocalEuropeanaFilters(candidate.recordId, candidate.provider, filters)) {
      continue;
    }
    const current = bestScores.get(candidate.recordId);
    if (current === undefined || candidate.score > current) {
      bestScores.set(candidate.recordId, candidate.score);
    }
  }

  return [...bestScores.entries()]
    .map(([recordId, score]) => ({
      recordId,
      score: clampVisualScore(score),
    }))
    .sort((a, b) => b.score - a.score || a.recordId.localeCompare(b.recordId));
}

function toLocalCandidates(results: ClipCandidate[], filters: EuropeanaVisualFilters): EuropeanaVisualItem[] {
  const localRows = getLocalRowsByIds(results.map((result) => result.id));
  return dedupeCandidates(
    results
      .map((result) => {
        const row = localRows.get(result.id);
        if (!row?.inventory_number) return null;
        return {
          recordId: row.inventory_number,
          provider: row.sub_museum,
          score: result.similarity,
        };
      })
      .filter((candidate): candidate is { recordId: string; provider: string | null; score: number } => Boolean(candidate)),
    filters,
  );
}

async function collectSearchItems(
  query: string,
  filters: EuropeanaVisualFilters,
  requiredCount: number,
): Promise<EuropeanaVisualItem[]> {
  let fetchLimit = Math.max(LOCAL_SEARCH_FETCH_FLOOR, requiredCount * 3);
  let previousRawCount = -1;
  let collected: EuropeanaVisualItem[] = [];

  while (fetchLimit <= MAX_LOCAL_WINDOW) {
    const raw = await clipSearch(query, fetchLimit, 0, EUROPEANA_SOURCE, {
      variantMode: LOCAL_SEARCH_VARIANT,
    });
    collected = toLocalCandidates(raw as ClipCandidate[], filters);

    if (collected.length >= requiredCount || raw.length < fetchLimit || raw.length === previousRawCount) {
      break;
    }

    previousRawCount = raw.length;
    const nextLimit = Math.min(MAX_LOCAL_WINDOW, fetchLimit * 2);
    if (nextLimit === fetchLimit) break;
    fetchLimit = nextLimit;
  }

  return collected;
}

function getNeighborCandidates(seedIds: number[], filters: EuropeanaVisualFilters): EuropeanaVisualItem[] {
  const uniqueSeedIds = [...new Set(seedIds)].filter((id) => Number.isInteger(id));
  if (uniqueSeedIds.length === 0) return [];

  const db = getDb();
  const placeholders = uniqueSeedIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT n.neighbor_artwork_id AS id, n.distance
     FROM artwork_neighbors n
     JOIN artworks a ON a.id = n.neighbor_artwork_id
     WHERE n.artwork_id IN (${placeholders})
       AND a.source = ?
     ORDER BY n.rank ASC
     LIMIT ?`
  ).all(...uniqueSeedIds, EUROPEANA_SOURCE, Math.max(LOCAL_SIMILAR_OVERFETCH, uniqueSeedIds.length * 12)) as NeighborRow[];

  const localRows = getLocalRowsByIds(rows.map((row) => row.id));
  return dedupeCandidates(
    rows
      .map((row) => {
        const local = localRows.get(row.id);
        if (!local?.inventory_number) return null;
        return {
          recordId: local.inventory_number,
          provider: local.sub_museum,
          score: scoreFromNeighborDistance(row.distance),
        };
      })
      .filter((candidate): candidate is { recordId: string; provider: string | null; score: number } => Boolean(candidate)),
    filters,
  );
}

async function collectSimilarItems(
  seedIds: number[],
  filters: EuropeanaVisualFilters,
  requiredCount: number,
): Promise<EuropeanaVisualItem[]> {
  const neighborItems = getNeighborCandidates(seedIds, filters);
  if (neighborItems.length >= requiredCount) {
    return neighborItems;
  }

  let fetchLimit = Math.max(LOCAL_SIMILAR_OVERFETCH, requiredCount * 3);
  let previousRawCount = -1;
  let collected = neighborItems;

  while (fetchLimit <= MAX_LOCAL_WINDOW) {
    const raw = await clipSearchFromSeedIds(seedIds, fetchLimit, 0, EUROPEANA_SOURCE);
    collected = toLocalCandidates(raw as ClipCandidate[], filters);

    if (collected.length >= requiredCount || raw.length < fetchLimit || raw.length === previousRawCount) {
      break;
    }

    previousRawCount = raw.length;
    const nextLimit = Math.min(MAX_LOCAL_WINDOW, fetchLimit * 2);
    if (nextLimit === fetchLimit) break;
    fetchLimit = nextLimit;
  }

  return collected;
}

function pageItems(items: EuropeanaVisualItem[], limit: number, offset: number): {
  items: EuropeanaVisualItem[];
  nextCursor: string | null;
} {
  const page = items.slice(offset, offset + limit);
  return {
    items: page,
    nextCursor: offset + limit < items.length
      ? encodeVisualCursor({ kind: "offset", offset: offset + limit })
      : null,
  };
}

export async function searchEuropeanaVisual(args: {
  query: string;
  limit?: number;
  cursor?: string | null;
  filters?: EuropeanaVisualFilters;
}): Promise<EuropeanaVisualResponse> {
  const query = args.query.trim().slice(0, 140);
  const limit = coerceLimit(args.limit);
  const filters = args.filters || {
    reusability: null,
    theme: null,
    provider: null,
    dataset: null,
    hasThumbnail: null,
    hasMedia: null,
    hasLandingPage: null,
  };
  const decodedCursor = decodeVisualCursor(args.cursor);
  const offset = decodedCursor?.kind === "offset" ? decodedCursor.offset : 0;

  if (!query) {
    return {
      items: [],
      nextCursor: null,
      meta: {
        ...demoCorpusMeta(filters),
        mode: "visual-search",
        query,
      },
    };
  }

  const collected = await collectSearchItems(query, filters, offset + limit);
  const page = pageItems(collected, limit, offset);

  return {
    ...page,
    meta: {
      ...demoCorpusMeta(filters),
      mode: "visual-search",
      query,
      limit,
      offset,
      totalLoaded: collected.length,
    },
  };
}

export async function searchEuropeanaSimilar(args: {
  recordId: string;
  limit?: number;
  cursor?: string | null;
  filters?: EuropeanaVisualFilters;
}): Promise<EuropeanaVisualResponse> {
  const recordId = normalizeRecordId(args.recordId);
  const limit = coerceLimit(args.limit);
  const filters = args.filters || {
    reusability: null,
    theme: null,
    provider: null,
    dataset: null,
    hasThumbnail: null,
    hasMedia: null,
    hasLandingPage: null,
  };
  const decodedCursor = decodeVisualCursor(args.cursor);
  const offset = decodedCursor?.kind === "offset" ? decodedCursor.offset : 0;

  if (!recordId) {
    return {
      items: [],
      nextCursor: null,
      meta: {
        ...demoCorpusMeta(filters),
        mode: "visual-similar",
        recordId: args.recordId,
        missingSeed: true,
      },
    };
  }

  const seedIds = getArtworkIdsForRecordId(recordId);
  if (seedIds.length === 0) {
    return {
      items: [],
      nextCursor: null,
      meta: {
        ...demoCorpusMeta(filters),
        mode: "visual-similar",
        recordId,
        missingSeed: true,
      },
    };
  }

  const collected = (await collectSimilarItems(seedIds, filters, offset + limit))
    .filter((item) => item.recordId !== recordId);
  const page = pageItems(collected, limit, offset);

  return {
    ...page,
    meta: {
      ...demoCorpusMeta(filters),
      mode: "visual-similar",
      recordId,
      limit,
      offset,
      totalLoaded: collected.length,
    },
  };
}

export async function searchEuropeanaColor(args: {
  hex: string;
  limit?: number;
  cursor?: string | null;
  filters?: EuropeanaVisualFilters;
}): Promise<EuropeanaVisualResponse> {
  const hex = normalizeHexColor(args.hex);
  const limit = coerceLimit(args.limit);
  const filters = args.filters || {
    reusability: null,
    theme: null,
    provider: null,
    dataset: null,
    hasThumbnail: null,
    hasMedia: null,
    hasLandingPage: null,
  };
  const decodedCursor = decodeVisualCursor(args.cursor);
  const remoteCursor = decodedCursor?.kind === "europeana" ? decodedCursor.cursor : null;

  if (!hex) {
    return {
      items: [],
      nextCursor: null,
      meta: {
        ...demoCorpusMeta(filters),
        mode: "visual-color",
        invalidHex: true,
      },
    };
  }

  const results = await colourPaletteSearch({
    hex,
    limit,
    cursor: remoteCursor,
    filters,
  });

  return {
    items: results.items,
    nextCursor: results.nextCursor
      ? encodeVisualCursor({ kind: "europeana", cursor: results.nextCursor })
      : null,
    meta: {
      ...demoCorpusMeta(filters),
      mode: "visual-color",
      hex,
      limit,
      remoteCursor: remoteCursor || "*",
    },
  };
}

export async function hydrateEuropeanaDemoRecords(args: {
  recordIds: string[];
  limit?: number;
}): Promise<{
  items: EuropeanaHydratedRecord[];
  meta: Record<string, unknown>;
}> {
  const limit = Math.min(coerceLimit(args.limit ?? LOCAL_HYDRATE_LIMIT, LOCAL_HYDRATE_LIMIT, LOCAL_HYDRATE_LIMIT), LOCAL_HYDRATE_LIMIT);
  const recordIds = args.recordIds
    .map((recordId) => normalizeRecordId(recordId))
    .filter((recordId): recordId is string => Boolean(recordId))
    .slice(0, limit);
  const items = await hydrateEuropeanaRecords(recordIds);

  return {
    items,
    meta: {
      source: EUROPEANA_SOURCE,
      limit,
      count: items.length,
    },
  };
}
