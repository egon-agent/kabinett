import type { Route } from "./+types/museum";
import { getDb } from "../lib/db.server";
import { buildImageUrl } from "../lib/images";
import { getEnabledMuseums, getMuseumInfo } from "../lib/museums.server";
import { parseArtist } from "../lib/parsing";
import InfiniteArtworkGrid from "../components/InfiniteArtworkGrid";
import FeaturedGrid from "../components/FeaturedGrid";

function formatRange(minYear: number | null, maxYear: number | null): string {
  if (!minYear || !maxYear) return "Okänt";
  if (minYear === maxYear) return String(minYear);
  return `${minYear}–${maxYear}`;
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.museum) return [{ title: "Museum — Kabinett" }];
  const title = `${data.museum.name} — Kabinett`;
  const description = data.museum.description || "";
  const tags = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
  if (data.ogImageUrl) {
    tags.push(
      { property: "og:image", content: data.ogImageUrl },
      { name: "twitter:image", content: data.ogImageUrl }
    );
  }
  return tags;
}

type FeaturedItem = {
  id: number;
  title: string;
  artist: string;
  datingText: string | null;
  imageUrl: string;
  color: string;
  focal_x: number | null;
  focal_y: number | null;
};

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
const museumFeaturedCache = new Map<string, { expiresAt: number; rows: FeaturedRow[] }>();

type CategoryStat = { name: string; count: number };

export async function loader({ params }: Route.LoaderArgs) {
  const id = (params.id || "").toLowerCase();
  const enabled = getEnabledMuseums();
  if (!id || !enabled.includes(id)) {
    throw new Response("Inte hittat", { status: 404 });
  }

  const museum = getMuseumInfo(id);
  if (!museum) throw new Response("Inte hittat", { status: 404 });

  const db = getDb();

  const totalWorks = (db
    .prepare("SELECT COUNT(*) as c FROM artworks WHERE source = ?")
    .get(id) as { c: number }).c;

  const dateRow = db
    .prepare(
      `SELECT MIN(year_start) as minYear, MAX(COALESCE(year_end, year_start)) as maxYear
       FROM artworks WHERE source = ? AND year_start > 0`
    )
    .get(id) as { minYear: number | null; maxYear: number | null };

  const rawCategories = db
    .prepare(
      `SELECT category, COUNT(*) as c
       FROM artworks
       WHERE source = ? AND category IS NOT NULL AND category != ''
       GROUP BY category`
    )
    .all(id) as Array<{ category: string; c: number }>;

  const categoryMap = new Map<string, number>();
  for (const row of rawCategories) {
    const label = row.category.split(" (")[0].trim();
    if (!label) continue;
    categoryMap.set(label, (categoryMap.get(label) || 0) + row.c);
  }

  const categories: CategoryStat[] = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const now = Date.now();
  const cachedFeatured = museumFeaturedCache.get(id);
  const featuredRows = cachedFeatured && cachedFeatured.expiresAt > now
    ? cachedFeatured.rows
    : (db
        .prepare(
          `SELECT id, title_sv, title_en, iiif_url, dominant_color, artists, dating_text, focal_x, focal_y
           FROM artworks
           WHERE source = ?
             AND iiif_url IS NOT NULL AND LENGTH(iiif_url) > 40
             AND id NOT IN (SELECT artwork_id FROM broken_images)
           ORDER BY ((rowid * 1103515245 + ?) & 2147483647)
           LIMIT 8`
        )
        .all(id, Math.floor(now / 60_000)) as FeaturedRow[]);

  if (!cachedFeatured || cachedFeatured.expiresAt <= now) {
    museumFeaturedCache.set(id, {
      expiresAt: now + FEATURED_CACHE_TTL_MS,
      rows: featuredRows,
    });
  }

  const featured: FeaturedItem[] = featuredRows.map((row) => ({
    id: row.id,
    title: row.title_sv || row.title_en || "Utan titel",
    artist: parseArtist(row.artists),
    datingText: row.dating_text || null,
    imageUrl: buildImageUrl(row.iiif_url, 400),
    color: row.dominant_color || "#D4CDC3",
    focal_x: row.focal_x,
    focal_y: row.focal_y,
  }));

  const ogImageUrl = featuredRows[0]?.iiif_url
    ? (id === "nationalmuseum" ? buildImageUrl(featuredRows[0].iiif_url, 800) : featuredRows[0].iiif_url)
    : null;

  return {
    museum: {
      id: museum.id,
      name: museum.name,
      description: museum.description,
      url: museum.url,
    },
    stats: {
      totalWorks,
      dateRange: formatRange(dateRow?.minYear || null, dateRow?.maxYear || null),
      categories,
    },
    featured,
    ogImageUrl,
  };
}

export default function Museum({ loaderData }: Route.ComponentProps) {
  const { museum, stats, featured } = loaderData;

  return (
    <div className="min-h-screen pt-16 bg-white">
      <div className="max-w-5xl mx-auto px-5 lg:px-6">
        <div className="pt-8">
          <p className="text-[0.65rem] tracking-[0.2em] uppercase text-secondary">Museum</p>
          <h1 className="text-[2.2rem] lg:text-[2.6rem] text-primary m-0 mt-1">
            {museum.name}
          </h1>
          {museum.description && (
            <p className="mt-3 text-[1rem] lg:text-[1.05rem] text-secondary max-w-3xl">
              {museum.description}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`/search?museum=${encodeURIComponent(museum.id)}`}
              className="inline-flex items-center justify-center px-5 h-[2.5rem] bg-primary text-white text-[0.82rem] no-underline font-medium hover:bg-black transition-colors focus-ring"
            >
              Utforska
            </a>
            {museum.url && (
              <a
                href={museum.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center px-5 h-[2.5rem] border border-rule/30 text-primary text-[0.82rem] no-underline font-medium hover:bg-paper transition-colors focus-ring"
              >
                Besök webbplats
              </a>
            )}
          </div>
        </div>

        <section className="pt-10">
          <h2 className="sr-only">Nyckeltal</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white p-5">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-secondary m-0">Verk</p>
              <p className="text-[1.6rem] text-primary mt-2">
                {stats.totalWorks.toLocaleString("sv")}
              </p>
            </div>
            <div className="bg-white p-5">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-secondary m-0">Tidsomfång</p>
              <p className="text-[1.6rem] text-primary mt-2">
                {stats.dateRange}
              </p>
            </div>
            <div className="bg-white p-5">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-secondary m-0">Kategorier</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.categories.length > 0 ? (
                  stats.categories.map((c) => (
                    <span
                      key={c.name}
                      className="text-xs px-2 py-0.5 bg-paper text-primary"
                    >
                      {c.name} · {c.count.toLocaleString("sv")}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-secondary">Inga kategorier hittades</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="pt-10 pb-6">
          <h2 className="text-[1.35rem] text-primary">Utvalda verk</h2>
          <FeaturedGrid items={featured} />
        </section>

        <InfiniteArtworkGrid
          fetchUrl={`/api/collection-works?museum=${encodeURIComponent(museum.id)}`}
        />
      </div>
    </div>
  );
}
