type PerfPayload = Record<string, unknown>;

const PERF_STORAGE_KEY = "kabinett-perf-log";
const RESOURCE_LOG_THRESHOLD_MS = 120;
const LONG_TASK_LOG_THRESHOLD_MS = 50;

declare global {
  interface Window {
    __kabinettPerfInitialized?: boolean;
  }
}

function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100;
}

function clientPerfEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PERF_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function logClientPerf(event: string, payload: PerfPayload = {}) {
  if (!clientPerfEnabled()) return;
  const record = {
    ts: new Date().toISOString(),
    event,
    ...payload,
  };
  console.info(`[PERF][client] ${JSON.stringify(record)}`);
}

function extractRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function extractRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "object" && "method" in input && typeof input.method === "string") {
    return input.method.toUpperCase();
  }
  return "GET";
}

function installFetchInstrumentation() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const start = performance.now();
    const method = extractRequestMethod(input, init);
    const url = extractRequestUrl(input);

    try {
      const response = await originalFetch(input, init);
      logClientPerf("fetch.response", {
        method,
        url,
        status: response.status,
        ok: response.ok,
        durationMs: roundMs(performance.now() - start),
        serverTiming: response.headers.get("server-timing") || undefined,
      });
      return response;
    } catch (error) {
      logClientPerf("fetch.error", {
        method,
        url,
        durationMs: roundMs(performance.now() - start),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

type XhrMeta = {
  method: string;
  startMs: number;
  url: string;
};

type InstrumentedXhr = XMLHttpRequest & {
  __perfMeta?: XhrMeta;
};

function installXhrInstrumentation() {
  const originalOpen = XMLHttpRequest.prototype.open as (...args: any[]) => void;
  const originalSend = XMLHttpRequest.prototype.send as (...args: any[]) => void;

  XMLHttpRequest.prototype.open = function (
    this: InstrumentedXhr,
    method: string,
    url: string | URL,
    ...rest: any[]
  ) {
    this.__perfMeta = {
      method: method.toUpperCase(),
      startMs: 0,
      url: String(url),
    };
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (this: InstrumentedXhr, ...rest: any[]) {
    if (this.__perfMeta) {
      this.__perfMeta.startMs = performance.now();
      this.addEventListener("loadend", () => {
        const meta = this.__perfMeta;
        if (!meta) return;
        logClientPerf("xhr.response", {
          method: meta.method,
          url: meta.url,
          status: this.status,
          durationMs: roundMs(performance.now() - meta.startMs),
        });
      }, { once: true });
    }
    return originalSend.call(this, ...rest);
  };
}

function observePerformanceEntry(type: string, onEntry: (entry: PerformanceEntry) => void) {
  if (!("PerformanceObserver" in window)) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        onEntry(entry);
      }
    });
    observer.observe({ type, buffered: true });
  } catch {
    // ignore unsupported observer types
  }
}

function logNavigationTiming() {
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (!entry) return;
  const serverTiming = entry.serverTiming?.map((item) => ({
    name: item.name,
    duration: item.duration,
    description: item.description,
  }));
  logClientPerf("navigation", {
    durationMs: roundMs(entry.duration),
    ttfbMs: roundMs(entry.responseStart),
    domInteractiveMs: roundMs(entry.domInteractive),
    domCompleteMs: roundMs(entry.domComplete),
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize,
    decodedBodySize: entry.decodedBodySize,
    serverTiming,
  });
}

function installPerformanceObservers() {
  observePerformanceEntry("resource", (entry) => {
    const resource = entry as PerformanceResourceTiming;
    if (
      resource.duration < RESOURCE_LOG_THRESHOLD_MS
      && resource.initiatorType !== "fetch"
      && resource.initiatorType !== "xmlhttprequest"
    ) {
      return;
    }

    logClientPerf("resource", {
      name: resource.name,
      initiatorType: resource.initiatorType,
      durationMs: roundMs(resource.duration),
      transferSize: resource.transferSize,
      encodedBodySize: resource.encodedBodySize,
      decodedBodySize: resource.decodedBodySize,
    });
  });

  observePerformanceEntry("longtask", (entry) => {
    if (entry.duration < LONG_TASK_LOG_THRESHOLD_MS) return;
    logClientPerf("longtask", {
      name: entry.name,
      durationMs: roundMs(entry.duration),
      startTimeMs: roundMs(entry.startTime),
    });
  });

  observePerformanceEntry("largest-contentful-paint", (entry) => {
    logClientPerf("lcp", {
      startTimeMs: roundMs(entry.startTime),
      durationMs: roundMs(entry.duration),
    });
  });

  observePerformanceEntry("paint", (entry) => {
    logClientPerf("paint", {
      name: entry.name,
      startTimeMs: roundMs(entry.startTime),
    });
  });

  let cls = 0;
  observePerformanceEntry("layout-shift", (entry) => {
    const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
    if (layoutShift.hadRecentInput) return;
    cls += layoutShift.value || 0;
    logClientPerf("cls", { value: Number(cls.toFixed(4)) });
  });
}

export function initClientPerfLogging() {
  if (typeof window === "undefined") return;
  if (!clientPerfEnabled()) return;
  if (window.__kabinettPerfInitialized) return;
  window.__kabinettPerfInitialized = true;

  logClientPerf("session.start", {
    path: `${window.location.pathname}${window.location.search}`,
    userAgent: navigator.userAgent,
  });

  installFetchInstrumentation();
  installXhrInstrumentation();
  installPerformanceObservers();
  logNavigationTiming();
}
