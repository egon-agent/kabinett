import type { Route } from "./+types/api.decade-works";
import { getDb } from "../lib/db.server";
import { buildImageUrl } from "../lib/images";
import { sourceFilter } from "../lib/museums.server";
import { parseArtist } from "../lib/parsing";

const PAGE_SIZE = 60;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const decade = parseInt(url.searchParams.get("decade") || "0", 10);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

  if (!decade || decade < 1200 || decade > 2030) {
    return Response.json({ works: [], hasMore: false });
  }

  const db = getDb();
  const source = sourceFilter();

  const rows = db
    .prepare(
      `SELECT id, title_sv, title_en, iiif_url, dominant_color, artists, dating_text, year_start
       FROM artworks
       WHERE year_start BETWEEN ? AND ?
         AND iiif_url IS NOT NULL AND LENGTH(iiif_url) > 40
         AND id NOT IN (SELECT artwork_id FROM broken_images)
         AND ${source.sql}
       ORDER BY year_start ASC
       LIMIT ? OFFSET ?`
    )
    .all(decade, decade + 9, ...source.params, PAGE_SIZE + 1, offset) as any[];

  const hasMore = rows.length > PAGE_SIZE;
  if (hasMore) rows.pop();

  const works = rows.map((r: any) => ({
    id: r.id,
    title: r.title_sv || r.title_en || "Utan titel",
    artist: parseArtist(r.artists),
    imageUrl: buildImageUrl(r.iiif_url, 400),
    color: r.dominant_color || "#2B2A27",
    year: r.dating_text ?? (r.year_start ? String(r.year_start) : ""),
  }));

  return Response.json(
    { works, hasMore },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
