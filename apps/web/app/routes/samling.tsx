import type { Route } from "./+types/samling";
import { getDb } from "../lib/db.server";
import { buildImageUrl } from "../lib/images";
import { sourceFilter } from "../lib/museums.server";
import { parseArtist } from "../lib/parsing";
import InfiniteArtworkGrid from "../components/InfiniteArtworkGrid";
import FeaturedGrid from "../components/FeaturedGrid";

type FeaturedRow = {
  id: number;
  title_sv: string | null;
  title_en: string | null;
  iiif_url: string;
  dominant_color: string | null;
  artists: string | null;
  dating_text: string | null;
  focal_x: number | null;
  focal_y: number | null;
};

const FEATURED_CACHE_TTL_MS = 60 * 1000;
const collectionFeaturedCache = new Map<string, { expiresAt: number; rows: FeaturedRow[] }>();

function formatRange(minYear: number | null, maxYear: number | null): string {
  if (!minYear || !maxYear) return "Okänt";
  if (minYear === maxYear) return String(minYear);
  return `${minYear}–${maxYear}`;
}

export function headers() {
  return { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.name) return [{ title: "Samling — Kabinett" }];
  const title = `${data.name} — Kabinett`;
  return [
    { title },
    { name: "description", content: `Utforska ${data.stats.totalWorks.toLocaleString("sv")} verk från ${data.name} i Kabinett.` },
    { property: "og:title", content: title },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    ...(data.ogImageUrl
      ? [
          { property: "og:image", content: data.ogImageUrl },
          { name: "twitter:image", content: data.ogImageUrl },
        ]
      : []),
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  let slug = "";
  try {
    slug = decodeURIComponent(params.name || "");
  } catch (error) {
    if (error instanceof URIError) {
      throw new Response("Ogiltig URL-kodning", { status: 400 });
    }
    throw error;
  }
  const db = getDb();
  const sourceA = sourceFilter("a");

  // Find the collection — match sub_museum or museum name
  const check = db.prepare(`
    SELECT COUNT(*) as c FROM artworks a
    LEFT JOIN museums m ON m.id = a.source
    WHERE ${sourceA.sql}
      AND (a.sub_museum = ? OR (a.sub_museum IS NULL AND m.name = ?))
  `).get(...sourceA.params, slug, slug) as any;

  if (!check || check.c === 0) throw new Response("Inte hittat", { status: 404 });

  const whereClause = `${sourceA.sql} AND (a.sub_museum = ? OR (a.sub_museum IS NULL AND m.name = ?))`;

  const totalWorks = check.c as number;

  const dateRow = db.prepare(`
    SELECT MIN(a.year_start) as minYear, MAX(COALESCE(a.year_end, a.year_start)) as maxYear
    FROM artworks a LEFT JOIN museums m ON m.id = a.source
    WHERE ${whereClause} AND a.year_start > 0
  `).get(...sourceA.params, slug, slug) as { minYear: number | null; maxYear: number | null };

  const rawCategories = db.prepare(`
    SELECT a.category, COUNT(*) as c
    FROM artworks a LEFT JOIN museums m ON m.id = a.source
    WHERE ${whereClause} AND a.category IS NOT NULL AND a.category != ''
    GROUP BY a.category
  `).all(...sourceA.params, slug, slug) as Array<{ category: string; c: number }>;

  const categoryMap = new Map<string, number>();
  for (const row of rawCategories) {
    const label = row.category.split(" (")[0].trim();
    if (!label) continue;
    categoryMap.set(label, (categoryMap.get(label) || 0) + row.c);
  }
  const categories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const now = Date.now();
  const cachedFeatured = collectionFeaturedCache.get(slug);
  const featuredRows = cachedFeatured && cachedFeatured.expiresAt > now
    ? cachedFeatured.rows
    : (db.prepare(`
        SELECT a.id, a.title_sv, a.title_en, a.iiif_url, a.dominant_color, a.artists, a.dating_text, a.focal_x, a.focal_y
        FROM artworks a LEFT JOIN museums m ON m.id = a.source
        WHERE ${whereClause}
          AND a.iiif_url IS NOT NULL AND LENGTH(a.iiif_url) > 40
          AND a.id NOT IN (SELECT artwork_id FROM broken_images)
        ORDER BY ((a.rowid * 1103515245 + ?) & 2147483647)
        LIMIT 8
      `).all(...sourceA.params, slug, slug, Math.floor(now / 60_000)) as FeaturedRow[]);

  if (!cachedFeatured || cachedFeatured.expiresAt <= now) {
    collectionFeaturedCache.set(slug, {
      expiresAt: now + FEATURED_CACHE_TTL_MS,
      rows: featuredRows,
    });
  }

  const featured = featuredRows.map((row: any) => ({
    id: row.id,
    title: row.title_sv || row.title_en || "Utan titel",
    artist: parseArtist(row.artists),
    datingText: row.dating_text || null,
    imageUrl: buildImageUrl(row.iiif_url, 400),
    color: row.dominant_color || "#D4CDC3",
    focal_x: row.focal_x,
    focal_y: row.focal_y,
  }));

  const ogImageUrl = featuredRows[0]?.iiif_url ? buildImageUrl(featuredRows[0].iiif_url, 800) : null;

  return { name: slug, stats: { totalWorks, dateRange: formatRange(dateRow?.minYear || null, dateRow?.maxYear || null), categories }, featured, ogImageUrl };
}

export default function Samling({ loaderData }: Route.ComponentProps) {
  const { name, stats, featured } = loaderData;

  return (
    <div className="min-h-screen pt-16 bg-cream">
      <div className="max-w-5xl mx-auto px-5 lg:px-6">
        <div className="pt-8">
          <p className="text-[0.65rem] tracking-[0.2em] uppercase text-warm-gray">Samling</p>
          <h1 className="font-serif text-[2.2rem] lg:text-[2.6rem] text-charcoal m-0 mt-1">{name}</h1>
        </div>

        <section className="pt-10">
          <h2 className="sr-only">Nyckeltal</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white rounded-card p-5 shadow-card">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-warm-gray m-0">Verk</p>
              <p className="text-[1.6rem] font-serif text-charcoal mt-2">{stats.totalWorks.toLocaleString("sv")}</p>
            </div>
            <div className="bg-white rounded-card p-5 shadow-card">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-warm-gray m-0">Tidsomfång</p>
              <p className="text-[1.6rem] font-serif text-charcoal mt-2">{stats.dateRange}</p>
            </div>
            <div className="bg-white rounded-card p-5 shadow-card">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-warm-gray m-0">Kategorier</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.categories.length > 0 ? (
                  stats.categories.map((c) => (
                    <span key={c.name} className="text-xs px-2 py-0.5 rounded-pill bg-linen text-ink">
                      {c.name} · {c.count.toLocaleString("sv")}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-warm-gray">Inga kategorier</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="pt-10 pb-6">
          <h2 className="font-serif text-[1.35rem] text-charcoal">Utvalda verk</h2>
          <FeaturedGrid items={featured} />
        </section>

        <InfiniteArtworkGrid
          fetchUrl={`/api/collection-works?samling=${encodeURIComponent(name)}`}
        />
      </div>
    </div>
  );
}
