const UNKNOWN_ARTIST = "Okänd konstnär";
const GENERIC_CATEGORIES = new Set(["IMAGE", "TEXT", "SOUND", "VIDEO", "3D"]);

type ArtistCandidate = {
  name?: string;
  nationality?: string;
  role?: string;
};

type DimensionCandidate = {
  dimension_text?: string;
  dimension?: string;
  value?: string;
  width?: number | string;
  height?: number | string;
  bredd?: number | string;
  hojd?: number | string;
  W?: number | string;
  H?: number | string;
};

export type ParsedArtist = {
  name: string;
  nationality: string;
  role: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isUrlLikeValue(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^www\./i.test(value);
}

function isAuthorityLabel(value: string): boolean {
  return /^[0-9]+_[a-z][a-z0-9_-]*$/i.test(value);
}

function sanitizeArtistName(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  if (isUrlLikeValue(normalized)) return null;
  if (isAuthorityLabel(normalized)) return null;

  return normalized;
}

function sanitizeMetaValue(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = normalizeWhitespace(value);
  return isUrlLikeValue(normalized) ? "" : normalized;
}

export function parseArtists(json: string | null): ParsedArtist[] {
  if (!json) return [];

  try {
    const parsed = JSON.parse(json) as ArtistCandidate[] | ArtistCandidate;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const artists: ParsedArtist[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;

      const name = sanitizeArtistName(candidate.name);
      if (!name) continue;

      const dedupeKey = name.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      artists.push({
        name,
        nationality: sanitizeMetaValue(candidate.nationality),
        role: sanitizeMetaValue(candidate.role),
      });
    }

    return artists;
  } catch {
    return [];
  }
}

export function parseArtist(json: string | null): string {
  return parseArtists(json)[0]?.name || UNKNOWN_ARTIST;
}

export function normalizeArtworkCategory(value: string | null | undefined): string {
  const normalized = normalizeWhitespace(value?.split(" (")?.[0] || "");
  if (!normalized) return "";
  if (GENERIC_CATEGORIES.has(normalized.toUpperCase())) return "";
  return normalized;
}

export function formatDimensions(json: string | null): string {
  if (!json) return "";

  try {
    const parsed = JSON.parse(json) as DimensionCandidate[] | DimensionCandidate;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const dimensions = candidates
      .map((candidate) => {
        if (!candidate) return "";
        if (candidate.dimension_text) return String(candidate.dimension_text);
        if (candidate.dimension) return String(candidate.dimension);
        if (candidate.value) return String(candidate.value);

        const width = candidate.width ?? candidate.bredd ?? candidate.W;
        const height = candidate.height ?? candidate.hojd ?? candidate.H;
        if (width && height) return `${width} × ${height}`;
        return "";
      })
      .filter(Boolean);

    return dimensions.join(", ");
  } catch {
    return "";
  }
}
