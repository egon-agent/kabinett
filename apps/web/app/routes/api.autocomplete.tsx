import { getDb } from "../lib/db.server";
import type { Route } from "./+types/api.autocomplete";

// CLIP-inspired suggestions — things that work great with semantic search
const CLIP_SUGGESTIONS = [
  "katter", "hundar", "hästar", "blommor", "solnedgång", "snö", "havet",
  "barn", "dans", "musik", "krig", "guld", "naket", "mat", "frukt",
  "skog", "berg", "båtar", "fåglar", "natt", "vinter", "sommar",
  "rött", "blått", "porträtt", "stilleben", "ruiner", "kaniner",
  "skulpturer", "hattar", "skepp", "telefoner", "trädgård", "kyrka",
];

let hasArtistsTable: boolean | null = null;

function artistsTableExists(): boolean {
  if (hasArtistsTable !== null) return hasArtistsTable;
  const db = getDb();
  const row = db
    .prepare("SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'artists' LIMIT 1")
    .get() as { ok?: number } | undefined;
  hasArtistsTable = row?.ok === 1;
  return hasArtistsTable;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 80);

  if (q.length < 1) return Response.json([]);

  const db = getDb();
  const results: Array<{ value: string; type: string; count?: number }> = [];

  // 1. Artist matches from pre-computed artists table
  if (q.length >= 2 && artistsTableExists()) {
    try {
      const artists = db.prepare(
        `SELECT name, artwork_count as count
         FROM artists
         WHERE name LIKE ?
           AND name NOT LIKE '%känd%'
         ORDER BY artwork_count DESC
         LIMIT 4`
      ).all(`%${q}%`) as Array<{ name: string; count: number }>;

      for (const artist of artists) {
        results.push({
          value: artist.name,
          type: "artist",
          count: artist.count,
        });
      }
    } catch (_) {
      hasArtistsTable = false;
    }
  }

  // 2. CLIP suggestions that match what the user is typing
  const qLower = q.toLowerCase();
  const matchingClip = CLIP_SUGGESTIONS
    .filter((s) => s.startsWith(qLower) || s.includes(qLower))
    .slice(0, 3);

  for (const suggestion of matchingClip) {
    results.push({ value: suggestion, type: "clip" });
  }

  // 3. If very few results, show random CLIP suggestions as inspiration
  if (results.length < 3 && q.length <= 3) {
    const shuffled = CLIP_SUGGESTIONS
      .filter((s) => !matchingClip.includes(s))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3 - results.filter(r => r.type === "clip").length);
    for (const s of shuffled) {
      results.push({ value: s, type: "clip" });
    }
  }

  return Response.json(results.slice(0, 7));
}
