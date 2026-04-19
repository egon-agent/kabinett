import { useState, useRef, useEffect, useCallback } from "react";
import type { Route } from "./+types/timeline";
import { getDb } from "../lib/db.server";
import { buildImageUrl } from "../lib/images";
import { sourceFilter } from "../lib/museums.server";
import { parseArtist } from "../lib/parsing";
import GridCard from "../components/GridCard";
import { formatUiNumber, resolveUiLocale, uiText, useUiLocale } from "../lib/ui-language";
import { getCampaignConfig } from "../lib/campaign.server";

export function meta({ data }: Route.MetaArgs) {
  const isEnglish = data?.uiLocale === "en";
  return [
    { title: isEnglish ? "Timeline — Kabinett" : "Tidslinje — Kabinett" },
    {
      name: "description",
      content: isEnglish ? "800 years of art, decade by decade." : "800 år av konst, decennium för decennium.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const parsedDecade = Number.parseInt(url.searchParams.get("decade") || "0", 10);
  const selectedDecade = Number.isFinite(parsedDecade) ? parsedDecade : 0;
  const campaign = getCampaignConfig();
  const uiLocale = resolveUiLocale(campaign.id);

  const db = getDb();
  const source = sourceFilter();
  const rangeFrom = 1200;
  const rangeTo = 2000;

  const countRows = db
    .prepare(
      `SELECT (year_start / 10) * 10 as decade, COUNT(*) as count
       FROM artworks
       WHERE year_start BETWEEN ? AND ?
         AND iiif_url IS NOT NULL
         AND LENGTH(iiif_url) > 40
         AND id NOT IN (SELECT artwork_id FROM broken_images)
         AND ${source.sql}
       GROUP BY decade
       ORDER BY decade ASC`
    )
    .all(rangeFrom, rangeTo, ...source.params) as Array<{ decade: number; count: number }>;

  const sampleRows = db
    .prepare(
      `WITH ranked AS (
         SELECT
           id,
           title_sv,
         title_en,
         iiif_url,
         dominant_color,
         artists,
          dating_text,
          year_start,
          (year_start / 10) * 10 as decade,
          ROW_NUMBER() OVER (PARTITION BY (year_start / 10) * 10 ORDER BY id DESC) as rn
         FROM artworks
         WHERE year_start BETWEEN ? AND ?
           AND iiif_url IS NOT NULL
           AND LENGTH(iiif_url) > 40
           AND id NOT IN (SELECT artwork_id FROM broken_images)
           AND ${source.sql}
       )
       SELECT id, title_sv, title_en, iiif_url, dominant_color, artists, dating_text, year_start, decade
       FROM ranked
       WHERE rn <= 5
       ORDER BY decade ASC, year_start ASC`
    )
    .all(rangeFrom, rangeTo, ...source.params) as Array<{
      id: number;
      title_sv: string | null;
      title_en: string | null;
      iiif_url: string;
      dominant_color: string | null;
      artists: string | null;
      dating_text: string | null;
      year_start: number | null;
      decade: number;
    }>;

  const samplesByDecade = new Map<number, Array<{
    id: number;
    title: string;
    imageUrl: string;
    color: string;
    artist: string;
    year: string | number;
  }>>();

  for (const row of sampleRows) {
    const list = samplesByDecade.get(row.decade) || [];
    list.push({
      id: row.id,
      title: row.title_sv || row.title_en || "Utan titel",
      imageUrl: buildImageUrl(row.iiif_url, 400),
      color: row.dominant_color || "#2B2A27",
      artist: parseArtist(row.artists),
      year: row.dating_text ?? (row.year_start ? String(row.year_start) : ""),
    });
    samplesByDecade.set(row.decade, list);
  }

  const decades = countRows.map((row) => ({
    decade: row.decade,
    label: `${row.decade}s`,
    count: row.count,
    samples: samplesByDecade.get(row.decade) || [],
  }));

  let selectedWorks: Array<{
    id: number;
    title: string;
    imageUrl: string;
    color: string;
    artist: string;
    year: string | number;
  }> = [];
  let selectedLabel = "";
  let selectedTotal = 0;
  let selectedHasMore = false;
  if (selectedDecade >= rangeFrom && selectedDecade <= rangeTo) {
    selectedTotal = (
      db.prepare(
        `SELECT COUNT(*) as count
         FROM artworks
         WHERE year_start BETWEEN ? AND ?
           AND iiif_url IS NOT NULL
           AND LENGTH(iiif_url) > 40
           AND id NOT IN (SELECT artwork_id FROM broken_images)
           AND ${source.sql}`
      ).get(selectedDecade, selectedDecade + 9, ...source.params) as { count: number }
    ).count;

    const PAGE_SIZE = 60;
    const selectedRows = db
      .prepare(
        `SELECT id, title_sv, title_en, iiif_url, dominant_color, artists, dating_text, year_start
         FROM artworks
         WHERE year_start BETWEEN ? AND ?
           AND iiif_url IS NOT NULL
           AND LENGTH(iiif_url) > 40
           AND id NOT IN (SELECT artwork_id FROM broken_images)
           AND ${source.sql}
         ORDER BY year_start ASC
         LIMIT ${PAGE_SIZE + 1}`
      )
      .all(selectedDecade, selectedDecade + 9, ...source.params) as Array<{
        id: number;
        title_sv: string | null;
        title_en: string | null;
        iiif_url: string;
        dominant_color: string | null;
        artists: string | null;
        dating_text: string | null;
        year_start: number | null;
      }>;

    selectedHasMore = selectedRows.length > PAGE_SIZE;
    if (selectedHasMore) selectedRows.pop();

    selectedLabel = `${selectedDecade}–${selectedDecade + 9}`;
    selectedWorks = selectedRows.map((r) => ({
      id: r.id,
      title: r.title_sv || r.title_en || "Utan titel",
      imageUrl: buildImageUrl(r.iiif_url, 400),
      color: r.dominant_color || "#2B2A27",
      artist: parseArtist(r.artists),
      year: r.dating_text ?? (r.year_start ? String(r.year_start) : ""),
    }));
  }

  return { decades, selectedDecade, selectedLabel, selectedWorks, selectedTotal, selectedHasMore, uiLocale };
}

type DecadeWork = {
  id: number;
  title: string;
  imageUrl: string;
  color: string;
  artist: string;
  year: string | number;
};

export default function Timeline({ loaderData }: Route.ComponentProps) {
  const uiLocale = useUiLocale();
  const { decades, selectedDecade, selectedLabel, selectedWorks: initialWorks, selectedTotal, selectedHasMore: initialHasMore } = loaderData;

  const [works, setWorks] = useState<DecadeWork[]>(initialWorks);
  const [canLoadMore, setCanLoadMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(initialWorks.length);

  useEffect(() => {
    setWorks(initialWorks);
    setCanLoadMore(initialHasMore);
    offsetRef.current = initialWorks.length;
  }, [initialWorks, initialHasMore]);

  const loadMore = useCallback(async () => {
    if (loading || !canLoadMore || !selectedDecade) return;
    setLoading(true);
    setLoadError(false);
      try {
        const res = await fetch(`/api/decade-works?decade=${selectedDecade}&offset=${offsetRef.current}`);
      if (!res.ok) throw new Error("Could not load more artworks");
        const data = await res.json() as { works: DecadeWork[]; hasMore: boolean };
      if (data.works.length === 0) {
        setCanLoadMore(false);
      } else {
        offsetRef.current += data.works.length;
        setWorks((prev) => [...prev, ...data.works]);
        setCanLoadMore(data.hasMore);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedDecade, canLoadMore, loading]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="min-h-screen pt-16 bg-white text-primary">
      <div id="top" className="px-4 md:px-6 lg:px-10 pt-8 pb-2">
        <h1 className="text-[32px] text-primary leading-[1.3]">{uiText(uiLocale, "Tidslinje", "Timeline")}</h1>
        <p className="text-[15px] text-secondary mt-1">
          {uiText(uiLocale, "800 år av konst — från medeltid till modernism", "800 years of art, from the Middle Ages to modernism")}
        </p>
      </div>

      <div className="px-4 md:px-6 lg:px-10">
        <div className="timeline-scroll no-scrollbar" aria-label={uiText(uiLocale, "Tidslinje decennier", "Timeline decades")}>
          {decades.map((decade) => (
            <div key={decade.decade} className="timeline-column">
              <div className="timeline-label">{decade.decade}</div>
              {decade.samples.map((art) => (
                <a key={art.id} href={`/artwork/${art.id}`} className="timeline-card focus-ring">
                  <div className="aspect-[3/4] rounded-card overflow-hidden" style={{ backgroundColor: art.color }}>
                    <img
                      src={art.imageUrl}
                      alt={`${art.title} — ${art.artist}`}
                      loading="lazy"
                      decoding="async"
                      width={400}
                      height={533}
                      onError={(event) => {
                        event.currentTarget.classList.add("is-broken");
                      }}
                    />
                  </div>
                  <div className="timeline-card-meta">
                    <span className="text-[0.82rem] font-medium leading-[1.35] line-clamp-2 min-h-[2.2rem]">{art.title}</span>
                    <span className="text-xs text-secondary leading-snug line-clamp-1">{art.artist}</span>
                    <span className="text-xs text-secondary">{art.year}</span>
                  </div>
                </a>
              ))}
              <a className="timeline-expand focus-ring" href={`/timeline?decade=${decade.decade}#decade-${decade.decade}`}>
                {uiText(uiLocale, `Visa ${decade.count} verk`, `View ${formatUiNumber(decade.count, uiLocale)} works`)}
              </a>
            </div>
          ))}
        </div>
      </div>

      {selectedDecade > 0 && (
        <section id={`decade-${selectedDecade}`} className="pt-4 px-4 md:px-6 lg:px-10 pb-16">
          <div className="flex items-baseline justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-[1.7rem]">
                {selectedLabel}
              </h2>
              <p className="text-sm text-secondary">
                {uiText(uiLocale, `${selectedTotal.toLocaleString("sv")} verk`, `${formatUiNumber(selectedTotal, uiLocale)} works`)}
              </p>
            </div>
            <a
              href="#top"
              className="text-sm text-secondary no-underline focus-ring"
            >
              {uiText(uiLocale, "Tillbaka upp", "Back to top")}
            </a>
          </div>

          {works.length > 0 ? (
            <div className="timeline-grid mt-5">
              {works.map((art) => (
                <GridCard
                  key={art.id}
                  item={{ id: art.id, title: art.title, artist: art.artist, year: String(art.year), imageUrl: art.imageUrl, color: art.color }}
                  variant="light"
                />
              ))}
            </div>
          ) : (
            <p className="py-8 text-secondary">
              {uiText(uiLocale, "Inga verk från denna period.", "No works from this period.")}
            </p>
          )}
          {loadError && (
            <div className="text-center py-6" aria-live="polite">
              <p className="text-sm text-secondary mb-3">{uiText(uiLocale, "Kunde inte ladda fler verk.", "Could not load more artworks.")}</p>
              <button
                type="button"
                onClick={() => { setLoadError(false); loadMore(); }}
                className="px-4 py-2 cursor-pointer bg-paper text-secondary text-sm font-medium hover:bg-rule hover:text-primary transition-colors focus-ring"
              >
                {uiText(uiLocale, "Försök igen", "Try again")}
              </button>
            </div>
          )}
          {canLoadMore && !loadError && <div ref={sentinelRef} className="h-4" />}
          {loading && (
            <p className="text-center text-sm text-secondary py-4">
              {uiText(uiLocale, "Laddar fler verk…", "Loading more artworks…")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
