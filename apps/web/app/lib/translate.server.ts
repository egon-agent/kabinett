const cache = new Map<string, string>();
const TRANSLATE_TIMEOUT_MS = Number(process.env.KABINETT_TRANSLATE_TIMEOUT_MS ?? "700");

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

function normalizeToken(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function shouldTranslateToEnglish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[åäö]/i.test(trimmed)) return true;

  const normalized = normalizeToken(trimmed);
  if (!normalized) return false;
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

  const cached = cache.get(trimmed);
  if (cached) return cached;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=sv&tl=en&dt=t&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Response format: [[["translated","original",...],...]...]
    const translated = data?.[0]?.map((seg: any) => seg[0]).join("") || trimmed;
    cache.set(trimmed, translated);
    // Keep cache bounded
    if (cache.size > 5000) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
    return translated;
  } catch (err) {
    console.error("[Translate error]", err);
    return trimmed;
  }
}
