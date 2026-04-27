export const EUROPEANA_SOURCE = "europeana";
export const EUROPEANA_DEMO_CORPUS = {
  theme: "art",
  reusability: "open",
  hasMedia: true,
  hasThumbnail: true,
} as const;

export type EuropeanaReusability = "open" | "restricted" | "permission";

export type EuropeanaVisualFilters = {
  reusability: EuropeanaReusability | null;
  theme: string | null;
  provider: string | null;
  dataset: string | null;
  hasThumbnail: boolean | null;
  hasMedia: boolean | null;
  hasLandingPage: boolean | null;
};

export type EuropeanaVisualItem = {
  recordId: string;
  score: number;
};

export type EuropeanaVisualResponse = {
  items: EuropeanaVisualItem[];
  nextCursor: string | null;
  meta: Record<string, unknown>;
};

export type EuropeanaHydratedRecord = {
  recordId: string;
  title: string;
  provider: string | null;
  description: string | null;
  rights: string | null;
  thumbnailUrl: string | null;
  europeanaUrl: string;
  year: string | null;
  type: string | null;
};

type OffsetCursor = {
  kind: "offset";
  offset: number;
};

type EuropeanaCursor = {
  kind: "europeana";
  cursor: string;
};

export type EuropeanaVisualCursor = OffsetCursor | EuropeanaCursor;

export type LocalVisualCandidate = {
  artworkId: number;
  recordId: string;
  provider: string | null;
  score: number;
};

export type VisualSearchOptions = {
  variantMode?: "strict" | "balanced" | "expanded";
};

export type VectorIndex = {
  searchByText(query: string, limit: number, options?: VisualSearchOptions): Promise<LocalVisualCandidate[]>;
  searchBySeedArtworkIds(seedArtworkIds: number[], limit: number): Promise<LocalVisualCandidate[]>;
  getArtworkIdsForRecordId(recordId: string): number[];
  getNeighborCandidates(seedArtworkIds: number[], limit: number): LocalVisualCandidate[];
};

export type ColorSearchAdapter = {
  searchColor(args: {
    hex: string;
    limit: number;
    cursor?: string | null;
    filters: EuropeanaVisualFilters;
  }): Promise<{
    items: EuropeanaVisualItem[];
    nextCursor: string | null;
    indexSize?: number;
    engine?: string;
  }>;
};

export type HydrationAdapter = {
  hydrateRecords(recordIds: string[]): Promise<EuropeanaHydratedRecord[]>;
};

export type EuropeanaVisualLayerAdapters = {
  vectorIndex: VectorIndex;
  colorSearch: ColorSearchAdapter;
  hydration?: HydrationAdapter;
};

export type EuropeanaVisualLayerOptions = {
  maxLocalWindow?: number;
  searchFetchFloor?: number;
  searchVariantMode?: "strict" | "balanced" | "expanded";
  similarOverfetch?: number;
  hydrateLimit?: number;
};

const DEFAULT_FILTERS: EuropeanaVisualFilters = {
  reusability: null,
  theme: null,
  provider: null,
  dataset: null,
  hasThumbnail: null,
  hasMedia: null,
  hasLandingPage: null,
};

export function clampVisualScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

export function coerceLimit(value: unknown, fallback = 24, max = 48): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

export function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return null;
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(trimmed)) {
    return trimmed
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return null;
}

export function normalizeRecordId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return `/${parts.join("/")}`;
}

export function extractDatasetId(recordId: string): string | null {
  const normalized = normalizeRecordId(recordId);
  if (!normalized) return null;
  const parts = normalized.split("/").filter(Boolean);
  return parts[0] || null;
}

export function buildEuropeanaItemUrl(recordId: string, locale = "en"): string {
  const normalized = normalizeRecordId(recordId) || recordId;
  return `https://www.europeana.eu/${locale}/item${normalized}`;
}

export function normalizeVisualFilters(value: unknown): EuropeanaVisualFilters {
  const raw = typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
  const reusability = normalizeString(raw.reusability)?.toLowerCase();
  return {
    reusability: reusability === "open" || reusability === "restricted" || reusability === "permission"
      ? reusability
      : null,
    theme: normalizeString(raw.theme)?.toLowerCase() || null,
    provider: normalizeString(raw.provider),
    dataset: normalizeString(raw.dataset),
    hasThumbnail: normalizeBoolean(raw.hasThumbnail),
    hasMedia: normalizeBoolean(raw.hasMedia),
    hasLandingPage: normalizeBoolean(raw.hasLandingPage),
  };
}

export function matchesLocalEuropeanaFilters(
  recordId: string,
  provider: string | null,
  filters: EuropeanaVisualFilters,
): boolean {
  if (filters.dataset && extractDatasetId(recordId) !== filters.dataset) {
    return false;
  }

  if (filters.provider) {
    const a = filters.provider.trim().toLowerCase();
    const b = provider?.trim().toLowerCase() || "";
    if (a !== b) return false;
  }

  if (filters.theme && filters.theme !== EUROPEANA_DEMO_CORPUS.theme) {
    return false;
  }

  if (filters.reusability && filters.reusability !== EUROPEANA_DEMO_CORPUS.reusability) {
    return false;
  }

  if (filters.hasMedia === false || filters.hasThumbnail === false) {
    return false;
  }

  if (filters.hasLandingPage === false) {
    return false;
  }

  return true;
}

export function encodeVisualCursor(cursor: EuropeanaVisualCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeVisualCursor(value: unknown): EuropeanaVisualCursor | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<EuropeanaVisualCursor>;
    if (parsed.kind === "offset" && Number.isFinite(parsed.offset)) {
      return {
        kind: "offset",
        offset: Math.max(0, Math.trunc(Number(parsed.offset))),
      };
    }
    if (parsed.kind === "europeana" && typeof parsed.cursor === "string" && parsed.cursor.trim().length > 0) {
      return {
        kind: "europeana",
        cursor: parsed.cursor,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function demoCorpusMeta(filters: EuropeanaVisualFilters): Record<string, unknown> {
  return {
    source: EUROPEANA_SOURCE,
    demoCorpus: {
      theme: EUROPEANA_DEMO_CORPUS.theme,
      reusability: EUROPEANA_DEMO_CORPUS.reusability,
      hasMedia: EUROPEANA_DEMO_CORPUS.hasMedia,
      hasThumbnail: EUROPEANA_DEMO_CORPUS.hasThumbnail,
    },
    filters,
  };
}

function emptyFilters(): EuropeanaVisualFilters {
  return { ...DEFAULT_FILTERS };
}

function dedupeCandidates(
  candidates: LocalVisualCandidate[],
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

export function createEuropeanaVisualLayer(
  adapters: EuropeanaVisualLayerAdapters,
  options: EuropeanaVisualLayerOptions = {},
) {
  const maxLocalWindow = options.maxLocalWindow ?? 480;
  const searchFetchFloor = options.searchFetchFloor ?? 72;
  const searchVariantMode = options.searchVariantMode ?? "expanded";
  const similarOverfetch = options.similarOverfetch ?? 72;
  const hydrateLimit = options.hydrateLimit ?? 24;

  async function collectSearchItems(
    query: string,
    filters: EuropeanaVisualFilters,
    requiredCount: number,
  ): Promise<EuropeanaVisualItem[]> {
    let fetchLimit = Math.max(searchFetchFloor, requiredCount * 3);
    let previousRawCount = -1;
    let collected: EuropeanaVisualItem[] = [];

    while (fetchLimit <= maxLocalWindow) {
      const raw = await adapters.vectorIndex.searchByText(query, fetchLimit, {
        variantMode: searchVariantMode,
      });
      collected = dedupeCandidates(raw, filters);

      if (collected.length >= requiredCount || raw.length < fetchLimit || raw.length === previousRawCount) {
        break;
      }

      previousRawCount = raw.length;
      const nextLimit = Math.min(maxLocalWindow, fetchLimit * 2);
      if (nextLimit === fetchLimit) break;
      fetchLimit = nextLimit;
    }

    return collected;
  }

  async function collectSimilarItems(
    seedIds: number[],
    filters: EuropeanaVisualFilters,
    requiredCount: number,
  ): Promise<EuropeanaVisualItem[]> {
    const neighborItems = dedupeCandidates(
      adapters.vectorIndex.getNeighborCandidates(seedIds, Math.max(similarOverfetch, seedIds.length * 12)),
      filters,
    );
    if (neighborItems.length >= requiredCount) {
      return neighborItems;
    }

    let fetchLimit = Math.max(similarOverfetch, requiredCount * 3);
    let previousRawCount = -1;
    let collected = neighborItems;

    while (fetchLimit <= maxLocalWindow) {
      const raw = await adapters.vectorIndex.searchBySeedArtworkIds(seedIds, fetchLimit);
      collected = dedupeCandidates(raw, filters);

      if (collected.length >= requiredCount || raw.length < fetchLimit || raw.length === previousRawCount) {
        break;
      }

      previousRawCount = raw.length;
      const nextLimit = Math.min(maxLocalWindow, fetchLimit * 2);
      if (nextLimit === fetchLimit) break;
      fetchLimit = nextLimit;
    }

    return collected;
  }

  return {
    async search(args: {
      query: string;
      limit?: unknown;
      cursor?: string | null;
      filters?: EuropeanaVisualFilters;
    }): Promise<EuropeanaVisualResponse> {
      const query = args.query.trim().slice(0, 140);
      const limit = coerceLimit(args.limit);
      const filters = args.filters || emptyFilters();
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
    },

    async similar(args: {
      recordId: string;
      limit?: unknown;
      cursor?: string | null;
      filters?: EuropeanaVisualFilters;
    }): Promise<EuropeanaVisualResponse> {
      const recordId = normalizeRecordId(args.recordId);
      const limit = coerceLimit(args.limit);
      const filters = args.filters || emptyFilters();
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

      const seedIds = adapters.vectorIndex.getArtworkIdsForRecordId(recordId);
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
    },

    async color(args: {
      hex: string;
      limit?: unknown;
      cursor?: string | null;
      filters?: EuropeanaVisualFilters;
    }): Promise<EuropeanaVisualResponse> {
      const hex = normalizeHexColor(args.hex);
      const limit = coerceLimit(args.limit);
      const filters = args.filters || emptyFilters();
      const decodedCursor = decodeVisualCursor(args.cursor);
      const offset = decodedCursor?.kind === "offset" ? decodedCursor.offset : 0;

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

      const results = await adapters.colorSearch.searchColor({
        hex,
        limit: offset + limit + 1,
        cursor: null,
        filters,
      });
      const page = pageItems(results.items, limit, offset);

      return {
        ...page,
        meta: {
          ...demoCorpusMeta(filters),
          mode: "visual-color",
          hex,
          limit,
          offset,
          totalLoaded: results.items.length,
          indexSize: results.indexSize,
          engine: results.engine || "local-dominant-color",
        },
      };
    },

    async hydrateDemoRecords(args: {
      recordIds: string[];
      limit?: unknown;
    }): Promise<{
      items: EuropeanaHydratedRecord[];
      meta: Record<string, unknown>;
    }> {
      if (!adapters.hydration) {
        return {
          items: [],
          meta: {
            source: EUROPEANA_SOURCE,
            demoOnly: true,
            disabled: true,
          },
        };
      }

      const limit = Math.min(coerceLimit(args.limit ?? hydrateLimit, hydrateLimit, hydrateLimit), hydrateLimit);
      const recordIds = args.recordIds
        .map((recordId) => normalizeRecordId(recordId))
        .filter((recordId): recordId is string => Boolean(recordId))
        .slice(0, limit);
      const items = await adapters.hydration.hydrateRecords(recordIds);

      return {
        items,
        meta: {
          source: EUROPEANA_SOURCE,
          demoOnly: true,
          limit,
          count: items.length,
        },
      };
    },
  };
}
