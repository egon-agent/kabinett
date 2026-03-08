import type { Route } from "./+types/api.artist-works";
import { getDb } from "../lib/db.server";
import { buildImageUrl } from "../lib/images";
import { sourceFilter } from "../lib/museums.server";

function normalizeArtistName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const PAGE_SIZE = 60;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim() || "";
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

  if (!name) {
    return Response.json({ works: [], hasMore: false });
  }

  const db = getDb();
  const source = sourceFilter();
  const normalizedName = normalizeArtistName(name);

  const rows = normalizedName
    ? (db
        .prepare(
          `SELECT a.id, a.title_sv, a.title_en, a.iiif_url, a.dominant_color, a.dating_text
           FROM artwork_artists aa
           JOIN artworks a ON a.id = aa.artwork_id
           WHERE aa.artist_name_norm = ? AND a.iiif_url IS NOT NULL AND LENGTH(a.iiif_url) > 40
             AND a.id NOT IN (SELECT artwork_id FROM broken_images)
             AND ${source.sql}
           ORDER BY a.year_start ASC NULLS LAST
           LIMIT ? OFFSET ?`
        )
        .all(normalizedName, ...source.params, PAGE_SIZE + 1, offset) as any[])
    : [];

  const hasMore = rows.length > PAGE_SIZE;
  if (hasMore) rows.pop();

  const works = rows.map((r) => ({
    id: r.id,
    title: r.title_sv || r.title_en || "Utan titel",
    imageUrl: buildImageUrl(r.iiif_url, 400),
    color: r.dominant_color || "#D4CDC3",
    year: r.dating_text || "",
  }));

  return Response.json(
    { works, hasMore },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
