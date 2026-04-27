import {
  buildEuropeanaItemUrl,
  type EuropeanaHydratedRecord,
  type EuropeanaVisualFilters,
  normalizeRecordId,
} from "./europeana-visual.shared";

const EUROPEANA_API_BASE = (process.env.EUROPEANA_API_BASE || "https://api.europeana.eu").replace(/\/+$/, "");
const EUROPEANA_API_KEY = process.env.EUROPEANA_API_KEY?.trim()
  || process.env.EUROPEANA_WSKEY?.trim()
  || (process.env.NODE_ENV === "production" ? "" : "api2demo");
const EUROPEANA_FETCH_TIMEOUT_MS = Number(process.env.EUROPEANA_FETCH_TIMEOUT_MS ?? "15000");
const RECORD_CACHE_TTL_MS = Number(process.env.EUROPEANA_RECORD_CACHE_MS ?? "600000");

type SearchItem = {
  id?: unknown;
  title?: unknown;
  dataProvider?: unknown;
  provider?: unknown;
  dcDescription?: unknown;
  edmPreview?: unknown;
  rights?: unknown;
  type?: unknown;
  year?: unknown;
  link?: unknown;
};

type SearchResponse = {
  items?: SearchItem[];
  nextCursor?: string | null;
};

type CachedRecord = {
  record: EuropeanaHydratedRecord;
  expiresAt: number;
};

const recordCache = new Map<string, CachedRecord>();

function requireApiKey(): void {
  if (!EUROPEANA_API_KEY) {
    throw new Error("EUROPEANA_API_KEY is required for Europeana API calls.");
  }
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = firstString(item);
      if (resolved) return resolved;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["def", "en", "fr", "sv", "label", "#text", "$"]) {
      const resolved = firstString(record[key]);
      if (resolved) return resolved;
    }
  }

  return null;
}

function toHydratedRecord(item: SearchItem, fallbackRecordId: string): EuropeanaHydratedRecord {
  const normalizedRecordId = normalizeRecordId(firstString(item.id) || fallbackRecordId) || fallbackRecordId;
  return {
    recordId: normalizedRecordId,
    title: firstString(item.title) || "Utan titel",
    provider: firstString(item.dataProvider) || firstString(item.provider),
    description: firstString(item.dcDescription),
    rights: firstString(item.rights),
    thumbnailUrl: firstString(item.edmPreview),
    europeanaUrl: buildEuropeanaItemUrl(normalizedRecordId),
    year: firstString(item.year),
    type: firstString(item.type),
  };
}

async function fetchEuropeanaJson<T>(url: URL): Promise<T> {
  requireApiKey();
  const response = await fetch(url, {
    headers: {
      "X-Api-Key": EUROPEANA_API_KEY,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(EUROPEANA_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Europeana API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function hydrateEuropeanaRecord(recordId: string): Promise<EuropeanaHydratedRecord | null> {
  const normalizedRecordId = normalizeRecordId(recordId);
  if (!normalizedRecordId) return null;

  const now = Date.now();
  const cached = recordCache.get(normalizedRecordId);
  if (cached && cached.expiresAt > now) {
    return cached.record;
  }

  const query = `europeana_id:"${normalizedRecordId}"`;
  const url = new URL(`${EUROPEANA_API_BASE}/record/v2/search.json`);
  url.searchParams.set("query", query);
  url.searchParams.set("rows", "1");
  url.searchParams.set("thumbnail", "true");
  url.searchParams.set("media", "true");
  const payload = await fetchEuropeanaJson<SearchResponse>(url);
  const item = payload.items?.[0];
  if (!item) {
    return null;
  }

  const record = toHydratedRecord(item, normalizedRecordId);
  recordCache.set(normalizedRecordId, {
    record,
    expiresAt: now + RECORD_CACHE_TTL_MS,
  });
  return record;
}

export async function hydrateEuropeanaRecords(recordIds: string[]): Promise<EuropeanaHydratedRecord[]> {
  const uniqueIds = [...new Set(recordIds.map((recordId) => normalizeRecordId(recordId)).filter(Boolean))] as string[];
  const results = await Promise.all(uniqueIds.map((recordId) => hydrateEuropeanaRecord(recordId)));
  const hydrated = results.filter((record): record is EuropeanaHydratedRecord => Boolean(record));
  const recordMap = new Map(hydrated.map((record) => [record.recordId, record]));
  return uniqueIds
    .map((recordId) => recordMap.get(recordId))
    .filter((record): record is EuropeanaHydratedRecord => Boolean(record));
}

export async function colourPaletteSearch(args: {
  hex: string;
  limit: number;
  cursor?: string | null;
  filters: EuropeanaVisualFilters;
}): Promise<{ items: Array<{ recordId: string; score: number }>; nextCursor: string | null }> {
  const { hex, limit, cursor, filters } = args;
  const url = new URL(`${EUROPEANA_API_BASE}/record/v2/search.json`);
  url.searchParams.set("query", "*");
  url.searchParams.set("rows", String(limit));
  url.searchParams.set("colourpalette", hex);
  url.searchParams.set("theme", filters.theme || "art");
  url.searchParams.set("reusability", filters.reusability || "open");
  url.searchParams.set("media", String(filters.hasMedia ?? true));
  url.searchParams.set("thumbnail", String(filters.hasThumbnail ?? true));
  if (filters.hasLandingPage === true) {
    url.searchParams.set("landingpage", "true");
  }
  if (filters.provider) {
    url.searchParams.append("qf", `DATA_PROVIDER:"${filters.provider.replace(/"/g, "")}"`);
  }
  if (filters.dataset) {
    url.searchParams.append("qf", `edm_datasetName:${filters.dataset.replace(/[^0-9A-Za-z_-]/g, "")}*`);
  }
  if (cursor?.trim()) {
    url.searchParams.set("cursor", cursor);
  } else {
    url.searchParams.set("cursor", "*");
  }

  const payload = await fetchEuropeanaJson<SearchResponse>(url);
  const items = (payload.items || [])
    .map((item) => normalizeRecordId(firstString(item.id)))
    .filter((recordId): recordId is string => Boolean(recordId))
    .map((recordId, index) => ({
      recordId,
      score: Number((1 - (index / Math.max(1, limit))).toFixed(6)),
    }));

  return {
    items,
    nextCursor: payload.nextCursor?.trim() || null,
  };
}
