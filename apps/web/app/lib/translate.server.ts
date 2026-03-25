const cache = new Map<string, string>();
const inflightTranslations = new Map<string, Promise<string>>();
const failedTranslations = new Map<string, number>();
const TRANSLATE_TIMEOUT_MS = Number(process.env.KABINETT_TRANSLATE_TIMEOUT_MS ?? "700");
const TRANSLATE_FAILURE_TTL_MS = Number(process.env.KABINETT_TRANSLATE_FAILURE_TTL_MS ?? "5000");
const TRANSLATE_CACHE_MAX_ENTRIES = 5000;

const SWEDISH_HINTS = new Set([
  "och",
  "eller",
  "med",
  "utan",
  "fran",
  "från",
  "till",
  "som",
  "ett",
  "en",
  "den",
  "det",
  "de",
  "av",
  "klanning",
  "klänning",
  "drakt",
  "dräkt",
  "portratt",
  "porträtt",
  "landskap",
  "skulptur",
  "stilleben",
  "hast",
  "häst",
  "blommor",
  "skog",
  "vinter",
  "guld",
  "silver",
  "rod",
  "röd",
  "bla",
  "blå",
  "gron",
  "grön",
]);

const ENGLISH_HINTS = new Set([
  "portrait",
  "landscape",
  "sculpture",
  "painting",
  "dress",
  "coat",
  "jacket",
  "shirt",
  "skirt",
  "flowers",
  "flower",
  "horse",
  "forest",
  "winter",
  "gold",
  "silver",
  "blue",
  "red",
  "green",
  "photo",
  "photograph",
  "poster",
  "print",
  "chair",
  "table",
  "vase",
  "ship",
  "still",
  "life",
]);

const LOCAL_SWEDISH_TO_ENGLISH = new Map<string, string>([
  ["apple", "apple"],
  ["hav", "sea"],
  ["havet", "sea"],
  ["sjo", "lake"],
  ["sjon", "lake"],
  ["bat", "boat"],
  ["skepp", "ship"],
  ["solnedgang", "sunset"],
  ["barn som leker", "children playing"],
  ["rod klanning", "red dress"],
  ["bla klanning", "blue dress"],
  ["gron klanning", "green dress"],
  ["guld", "gold"],
  ["portratt", "portrait"],
  ["landskap", "landscape"],
  ["stilleben", "still life"],
  ["skulptur", "sculpture"],
  ["blommor", "flowers"],
  ["skog", "forest"],
  ["vinter", "winter"],
  ["hast", "horse"],
  ["hund", "dog"],
  ["katt", "cat"],
  ["fagel", "bird"],
]);

function normalizeToken(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function trimBoundedMap<T>(map: Map<string, T>): void {
  if (map.size <= TRANSLATE_CACHE_MAX_ENTRIES) return;
  const first = map.keys().next().value;
  if (first) map.delete(first);
}

function hasRecentTranslationFailure(text: string): boolean {
  const failedAt = failedTranslations.get(text);
  if (!failedAt) return false;
  if (Date.now() - failedAt < TRANSLATE_FAILURE_TTL_MS) {
    return true;
  }
  failedTranslations.delete(text);
  return false;
}

function rememberTranslationFailure(text: string): void {
  failedTranslations.set(text, Date.now());
  trimBoundedMap(failedTranslations);
}

async function fetchWithHardTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      fetch(url, { signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
        }, TRANSLATE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function getLocalEnglishTranslation(text: string): string | null {
  const normalized = normalizeToken(text);
  if (!normalized) return null;
  return LOCAL_SWEDISH_TO_ENGLISH.get(normalized) ?? null;
}

export function shouldTranslateToEnglish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[åäö]/i.test(trimmed)) return true;

  const normalized = normalizeToken(trimmed);
  if (!normalized) return false;
  const localTranslation = LOCAL_SWEDISH_TO_ENGLISH.get(normalized);
  if (localTranslation && normalizeToken(localTranslation) !== normalized) {
    return true;
  }
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  if (words.some((word) => SWEDISH_HINTS.has(word))) {
    return true;
  }

  if (words.some((word) => ENGLISH_HINTS.has(word))) {
    return false;
  }

  if (words.some((word) => /(?:ing|ed|ly|tion|ment|ness|ship)$/i.test(word))) {
    return false;
  }

  // Queries that are just years/IDs do not benefit from translation.
  if (words.every((word) => /^\d[\da-z-]*$/i.test(word))) {
    return false;
  }

  // For demo performance, treat ambiguous ASCII queries as English unless
  // they carry Swedish hints. That avoids unnecessary network fallbacks.
  return false;
}

/**
 * Translate text from Swedish to English using Google Translate's
 * free endpoint. Results are cached in memory.
 * Falls back to original text on failure.
 */
export async function translateToEnglish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (!shouldTranslateToEnglish(trimmed)) {
    return trimmed;
  }

  if (cache.has(trimmed)) {
    return cache.get(trimmed) ?? trimmed;
  }

  const localTranslation = getLocalEnglishTranslation(trimmed);
  if (localTranslation) {
    cache.set(trimmed, localTranslation);
    trimBoundedMap(cache);
    return localTranslation;
  }

  if (hasRecentTranslationFailure(trimmed)) {
    return trimmed;
  }

  const inflight = inflightTranslations.get(trimmed);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=sv&tl=en&dt=t&q=${encodeURIComponent(trimmed)}`;
      const res = await fetchWithHardTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Response format: [[["translated","original",...],...]...]
      const translated = data?.[0]?.map((seg: any) => seg[0]).join("") || trimmed;
      cache.set(trimmed, translated);
      trimBoundedMap(cache);
      failedTranslations.delete(trimmed);
      return translated;
    } catch (err) {
      rememberTranslationFailure(trimmed);
      if ((err as { name?: string }).name === "TimeoutError") {
        console.warn("[Translate timeout]", trimmed);
      } else {
        console.error("[Translate error]", err);
      }
      return trimmed;
    } finally {
      inflightTranslations.delete(trimmed);
    }
  })();

  inflightTranslations.set(trimmed, request);
  return request;
}
