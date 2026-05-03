import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  coerceLimit,
  createEuropeanaVisualLayer,
  normalizeVisualFilters,
} from "../../packages/europeana-visual-core/src/index";
import { createEuropeanaApiAdapter } from "./europeana-api-adapter";
import { createSqliteColorSearch } from "./sqlite-color-search";
import { createSqliteVectorIndex, getDemoSeedRecordIds } from "./sqlite-vector-index";

const PORT = Number(process.env.PORT || process.env.EUROPEANA_VISUAL_PORT || 4318);
const HOST = process.env.HOST || "0.0.0.0";
const BODY_LIMIT_BYTES = Number(process.env.EUROPEANA_VISUAL_BODY_LIMIT_BYTES ?? "65536");
const RATE_LIMIT_WINDOW_MS = Number(process.env.EUROPEANA_VISUAL_RATE_LIMIT_WINDOW_MS ?? "60000");
const RATE_LIMIT_MAX = Number(process.env.EUROPEANA_VISUAL_RATE_LIMIT_MAX ?? "120");
const ALLOWED_ORIGINS = (process.env.EUROPEANA_VISUAL_ALLOWED_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const europeanaApi = createEuropeanaApiAdapter();
const vectorIndex = createSqliteVectorIndex();
const visualLayer = createEuropeanaVisualLayer({
  vectorIndex,
  colorSearch: createSqliteColorSearch(),
  hydration: europeanaApi,
}, {
  maxLocalWindow: Number(process.env.EUROPEANA_VISUAL_MAX_WINDOW ?? "480"),
  searchFetchFloor: Number(process.env.EUROPEANA_VISUAL_FETCH_FLOOR ?? "72"),
  searchVariantMode: process.env.EUROPEANA_VISUAL_VARIANT_MODE === "strict"
    ? "strict"
    : process.env.EUROPEANA_VISUAL_VARIANT_MODE === "balanced"
      ? "balanced"
      : "expanded",
  similarOverfetch: Number(process.env.EUROPEANA_VISUAL_SIMILAR_OVERFETCH ?? "72"),
  hydrateLimit: Number(process.env.EUROPEANA_VISUAL_HYDRATE_LIMIT ?? "24"),
});

const rateLimitBuckets = new Map<string, { resetAt: number; count: number }>();

function getAllowedOrigin(origin: string | undefined): string | null {
  if (ALLOWED_ORIGINS.includes("*")) return origin || "*";
  if (!origin) return null;
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function setCorsHeaders(origin: string | undefined, headers: Record<string, string>): Record<string, string> {
  const allowedOrigin = getAllowedOrigin(origin);
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    ...headers,
  };
}

function writeJson(
  response: ServerResponse,
  origin: string | undefined,
  status: number,
  payload: unknown,
): void {
  response.writeHead(status, setCorsHeaders(origin, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }));
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > BODY_LIMIT_BYTES) {
      throw new Error("Request body too large.");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function filtersFromSearchParams(url: URL) {
  return normalizeVisualFilters({
    reusability: url.searchParams.get("reusability"),
    theme: url.searchParams.get("theme"),
    provider: url.searchParams.get("provider"),
    dataset: url.searchParams.get("dataset"),
    hasThumbnail: url.searchParams.get("hasThumbnail"),
    hasMedia: url.searchParams.get("hasMedia"),
    hasLandingPage: url.searchParams.get("hasLandingPage"),
  });
}

function getClientKey(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function isRateLimited(request: IncomingMessage): boolean {
  if (RATE_LIMIT_MAX <= 0) return false;
  const now = Date.now();
  const key = getClientKey(request);
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      resetAt: now + RATE_LIMIT_WINDOW_MS,
      count: 1,
    });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

const server = createServer(async (request, response) => {
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
  if (!request.url || !request.method) {
    writeJson(response, origin, 400, { error: "invalid_request" });
    return;
  }

  if (!getAllowedOrigin(origin) && origin) {
    writeJson(response, origin, 403, { error: "origin_not_allowed" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, setCorsHeaders(origin, {}));
    response.end();
    return;
  }

  if (isRateLimited(request)) {
    writeJson(response, origin, 429, { error: "rate_limited" });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (request.method === "GET" && pathname === "/") {
      writeJson(response, origin, 200, {
        service: "europeana-visual-search-demo",
        source: "europeana",
        productContract: {
          responseShape: "{ items: [{ recordId, score }], nextCursor, meta }",
          hydration: "Europeana-owned clients should hydrate records through Europeana APIs.",
        },
        endpoints: [
          "POST /v1/visual/search",
          "GET /v1/visual/similar/:recordId",
          "GET /v1/visual/color",
          "GET /v1/demo/seeds",
          "POST /v1/demo/hydrate",
          "GET /health",
        ],
      });
      return;
    }

    if (request.method === "GET" && pathname === "/health") {
      writeJson(response, origin, 200, {
        status: "ok",
        service: "europeana-visual-search-demo",
      });
      return;
    }

    if (request.method === "POST" && pathname === "/v1/visual/search") {
      const body = await readJsonBody(request) as Record<string, unknown>;
      const result = await visualLayer.search({
        query: typeof body.query === "string" ? body.query : "",
        limit: body.limit,
        cursor: typeof body.cursor === "string" ? body.cursor : null,
        filters: normalizeVisualFilters(body.filters),
      });
      writeJson(response, origin, 200, result);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/v1/visual/similar/")) {
      const recordId = decodeURIComponent(pathname.slice("/v1/visual/similar/".length));
      const result = await visualLayer.similar({
        recordId,
        limit: url.searchParams.get("limit"),
        cursor: url.searchParams.get("cursor"),
        filters: filtersFromSearchParams(url),
      });
      writeJson(response, origin, 200, result);
      return;
    }

    if (request.method === "GET" && pathname === "/v1/visual/color") {
      const result = await visualLayer.color({
        hex: url.searchParams.get("hex") || "",
        limit: url.searchParams.get("limit"),
        cursor: url.searchParams.get("cursor"),
        filters: filtersFromSearchParams(url),
      });
      writeJson(response, origin, 200, result);
      return;
    }

    if (request.method === "GET" && pathname === "/v1/demo/seeds") {
      const limit = coerceLimit(url.searchParams.get("limit"), 6, 12);
      const recordIds = getDemoSeedRecordIds(limit);
      const result = await visualLayer.hydrateDemoRecords({
        recordIds,
        limit,
      });
      writeJson(response, origin, 200, {
        ...result,
        meta: {
          ...result.meta,
          mode: "demo-similar-seeds",
        },
      });
      return;
    }

    if (request.method === "POST" && (pathname === "/v1/demo/hydrate" || pathname === "/v1/visual/demo/hydrate")) {
      const body = await readJsonBody(request) as Record<string, unknown>;
      const recordIds = Array.isArray(body.recordIds)
        ? body.recordIds.filter((value): value is string => typeof value === "string")
        : [];
      const result = await visualLayer.hydrateDemoRecords({
        recordIds,
        limit: body.limit,
      });
      writeJson(response, origin, 200, result);
      return;
    }

    writeJson(response, origin, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    writeJson(response, origin, 500, {
      error: "internal_error",
      message,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[europeana-visual-service] listening on http://${HOST}:${PORT}`);
});
