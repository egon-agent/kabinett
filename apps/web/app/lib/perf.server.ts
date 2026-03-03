import type Database from "better-sqlite3";
import { performance } from "node:perf_hooks";

type PerfPayload = Record<string, unknown>;

const PERF_ENABLED = process.env.KABINETT_PERF_LOG !== "0";
const SQL_LOG_THRESHOLD_MS = Number(process.env.KABINETT_PERF_SQL_MS ?? "5");
const FETCH_LOG_THRESHOLD_MS = Number(process.env.KABINETT_PERF_FETCH_MS ?? "0");

const FETCH_PATCHED = Symbol.for("kabinett.perf.fetch.patched");
const DB_PATCHED = Symbol.for("kabinett.perf.db.patched");

function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 260);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function logServerPerf(event: string, payload: PerfPayload) {
  if (!PERF_ENABLED) return;
  const record = {
    ts: new Date().toISOString(),
    event,
    ...payload,
  };
  console.log(`[PERF][server] ${JSON.stringify(record)}`);
}

function shouldLogQueryDuration(ms: number): boolean {
  return ms >= SQL_LOG_THRESHOLD_MS;
}

export function nowMs(): number {
  return performance.now();
}

export function logRequestStart(payload: PerfPayload) {
  logServerPerf("http.request.start", payload);
}

export function logRequestShell(payload: PerfPayload) {
  logServerPerf("http.request.shell", payload);
}

export function logRequestComplete(payload: PerfPayload) {
  logServerPerf("http.request.complete", payload);
}

export function logRequestError(payload: PerfPayload) {
  logServerPerf("http.request.error", payload);
}

function extractFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function extractFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "object" && "method" in input) {
    const method = input.method;
    if (typeof method === "string") return method.toUpperCase();
  }
  return "GET";
}

export function installServerFetchInstrumentation() {
  if (!PERF_ENABLED) return;
  const taggedGlobal = globalThis as typeof globalThis & { [FETCH_PATCHED]?: boolean };
  if (taggedGlobal[FETCH_PATCHED]) return;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = extractFetchMethod(input, init);
    const url = extractFetchUrl(input);
    const start = nowMs();

    try {
      const response = await originalFetch(input, init);
      const durationMs = nowMs() - start;

      if (durationMs >= FETCH_LOG_THRESHOLD_MS) {
        logServerPerf("fetch.response", {
          method,
          url,
          status: response.status,
          ok: response.ok,
          durationMs: roundMs(durationMs),
        });
      }

      return response;
    } catch (error) {
      logServerPerf("fetch.error", {
        method,
        url,
        durationMs: roundMs(nowMs() - start),
        error: errorMessage(error),
      });
      throw error;
    }
  };

  taggedGlobal[FETCH_PATCHED] = true;
}

function instrumentStatement(statement: Database.Statement, sql: string) {
  const query = normalizeSql(sql);
  const statementAny = statement as unknown as Record<string, unknown>;

  for (const methodName of ["all", "get", "run"] as const) {
    const original = statementAny[methodName];
    if (typeof original !== "function") continue;

    statementAny[methodName] = (...args: unknown[]) => {
      const start = nowMs();
      try {
        const result = (original as (...innerArgs: unknown[]) => unknown).apply(statement, args);
        const durationMs = nowMs() - start;
        if (shouldLogQueryDuration(durationMs)) {
          const rowCount = Array.isArray(result) ? result.length : undefined;
          const changes =
            result && typeof result === "object" && "changes" in result
              ? (result as { changes?: number }).changes
              : undefined;

          logServerPerf("db.query", {
            method: methodName,
            durationMs: roundMs(durationMs),
            params: args.length,
            rowCount,
            changes,
            sql: query,
          });
        }
        return result;
      } catch (error) {
        logServerPerf("db.error", {
          method: methodName,
          durationMs: roundMs(nowMs() - start),
          params: args.length,
          sql: query,
          error: errorMessage(error),
        });
        throw error;
      }
    };
  }

  return statement;
}

export function instrumentDb(db: Database.Database) {
  if (!PERF_ENABLED) return;
  const instrumentedDb = db as Database.Database & { [DB_PATCHED]?: boolean };
  if (instrumentedDb[DB_PATCHED]) return;

  const originalPrepare = db.prepare.bind(db);
  const patchedPrepare: typeof db.prepare = ((sql: string) => {
    const statement = originalPrepare(sql);
    return instrumentStatement(statement, sql);
  }) as typeof db.prepare;

  db.prepare = patchedPrepare;
  instrumentedDb[DB_PATCHED] = true;
}
