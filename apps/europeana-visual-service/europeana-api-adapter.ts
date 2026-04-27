import {
  buildEuropeanaItemUrl,
  type EuropeanaHydratedRecord,
  type HydrationAdapter,
  normalizeRecordId,
} from "../../packages/europeana-visual-core/src/index";

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

async function hydrateEuropeanaRecord(recordId: string): Promise<EuropeanaHydratedRecord | null> {
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
  if (!item) return null;

  const record = toHydratedRecord(item, normalizedRecordId);
  recordCache.set(normalizedRecordId, {
    record,
    expiresAt: now + RECORD_CACHE_TTL_MS,
  });
  return record;
}

export function createEuropeanaApiAdapter(): HydrationAdapter {
  return {
    async hydrateRecords(recordIds) {
      const uniqueIds = [...new Set(recordIds.map((recordId) => normalizeRecordId(recordId)).filter(Boolean))] as string[];
      const results = await Promise.all(uniqueIds.map((recordId) => hydrateEuropeanaRecord(recordId)));
      const hydrated = results.filter((record): record is EuropeanaHydratedRecord => Boolean(record));
      const recordMap = new Map(hydrated.map((record) => [record.recordId, record]));
      return uniqueIds
        .map((recordId) => recordMap.get(recordId))
        .filter((record): record is EuropeanaHydratedRecord => Boolean(record));
    },
  };
}
