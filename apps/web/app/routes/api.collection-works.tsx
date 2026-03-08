import type { Route } from "./+types/api.collection-works";
import { getDb } from "../lib/db.server";
import { buildImageUrl } from "../lib/images";
import { sourceFilter } from "../lib/museums.server";
import { parseArtist } from "../lib/parsing";

const PAGE_SIZE = 60;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const museum = url.searchParams.get("museum")?.trim() || "";
  const samling = url.searchParams.get("samling")?.trim() || "";
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

  if (!museum && !samling) {
    return Response.json({ works: [], hasMore: false });
  }

  const db = getDb();

  let rows: any[];

  if (museum) {
    // Museum: filter by source
    rows = db
      .prepare(
        `SELECT id, title_sv, title_en, iiif_url, dominant_color, artists, dating_text
         FROM artworks
         WHERE source = ?
           AND iiif_url IS NOT NULL AND LENGTH(iiif_url) > 40
           AND id NOT IN (SELECT artwork_id FROM broken_images)
         ORDER BY year_start ASC NULLS LAST
         LIMIT ? OFFSET ?`
      )
      .all(museum, PAGE_SIZE + 1, offset) as any[];
  } else {
    // Samling: filter by sub_museum or museum name
    const sourceA = sourceFilter("a");
    rows = db
      .prepare(
        `SELECT a.id, a.title_sv, a.title_en, a.iiif_url, a.dominant_color, a.artists, a.dating_text
         FROM artworks a
         LEFT JOIN museums m ON m.id = a.source
         WHERE ${sourceA.sql}
           AND (a.sub_museum = ? OR (a.sub_museum IS NULL AND m.name = ?))
           AND a.iiif_url IS NOT NULL AND LENGTH(a.iiif_url) > 40
           AND a.id NOT IN (SELECT artwork_id FROM broken_images)
         ORDER BY a.year_start ASC NULLS LAST
         LIMIT ? OFFSET ?`
      )
      .all(...sourceA.params, samling, samling, PAGE_SIZE + 1, offset) as any[];
  }

  const hasMore = rows.length > PAGE_SIZE;
  if (hasMore) rows.pop();

  const works = rows.map((r) => ({
    id: r.id,
    title: r.title_sv || r.title_en || "Utan titel",
    artist: parseArtist(r.artists),
    imageUrl: buildImageUrl(r.iiif_url, 400),
    color: r.dominant_color || "#D4CDC3",
    year: r.dating_text || "",
  }));

  return Response.json(
    { works, hasMore },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
