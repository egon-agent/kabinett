import { useCallback, useEffect, useRef, useState } from "react";
import ArtworkCard from "../components/ArtworkCard";
import HeroSearch from "../components/HeroSearch";
import SpotlightCard, { type SpotlightCardData } from "../components/SpotlightCard";
import ThemeCard, { type ThemeCardSection } from "../components/ThemeCard";
import WalkPromoCard from "../components/WalkPromoCard";
import type { ArtworkDisplayItem } from "../components/artwork-meta";
import { uiText, useUiLocale } from "../lib/ui-language";
import { homeLoader } from "./home.loader.server";
import { getThemes } from "../lib/themes";
import type { Route } from "./+types/home";

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, "\\u003C/");
}

type FeedItem = ArtworkDisplayItem;

type ThemeSectionEntry = { type: "theme" } & ThemeCardSection;
type ArtCard = { type: "art"; item: FeedItem };
type SpotlightCardEntry = { type: "spotlight" } & SpotlightCardData;
type WalkPromoCardEntry = { type: "walkPromo" };
type FeedEntry = ArtCard | ThemeSectionEntry | SpotlightCardEntry | WalkPromoCardEntry;

export function meta({ data }: Route.MetaArgs) {
  const total = data?.stats?.total ?? 0;
  const museums = data?.stats?.museums ?? 0;
  const roundedTotal = total >= 1000 ? Math.floor(total / 1000) * 1000 : total;
  const title = data?.metaTitle || "Kabinett — Utforska Sveriges kulturarv";
  const description = data?.metaDescription || `Upptäck över ${roundedTotal} verk från ${museums} svenska samlingar.`;
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
  if (data?.ogImageUrl) {
    tags.push(
      { property: "og:image", content: data.ogImageUrl },
      { name: "twitter:image", content: data.ogImageUrl }
    );
  }
  return tags;
}

export const links = ({ data }: { data?: { canonicalUrl?: string } } = {}) => {
  if (!data?.canonicalUrl) return [];
  return [{ rel: "canonical", href: data.canonicalUrl }];
};

export function headers() {
  return { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };
}

export async function loader({ request }: Route.LoaderArgs) {
  return homeLoader(request);
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const uiLocale = useUiLocale();
  const hasWalks = loaderData.campaignId !== "europeana";
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Kabinett",
    url: loaderData.canonicalUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${loaderData.origin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const [feed, setFeed] = useState<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [];
    const initial = loaderData.initialItems;
    const themes = loaderData.preloadedThemes || [];
    for (let i = 0; i < initial.length; i++) {
      entries.push({ type: "art", item: initial[i] });
      if (i === 9 && themes[0]) {
        entries.push({ type: "theme", ...themes[0] });
        if (hasWalks) entries.push({ type: "walkPromo" });
      }
      if (i === 14 && loaderData.spotlight) {
        entries.push({ type: "spotlight", ...loaderData.spotlight });
      }
      if (i === 19 && themes[1]) {
        entries.push({ type: "theme", ...themes[1] });
      }
    }

    if (themes.length > 0 && !entries.some((entry) => entry.type === "theme")) {
      entries.push({ type: "theme", ...themes[0] });
      if (hasWalks) entries.push({ type: "walkPromo" });
    }

    if (initial.length <= 14 && loaderData.spotlight && !entries.some((entry) => entry.type === "spotlight")) {
      entries.push({ type: "spotlight", ...loaderData.spotlight });
    }

    return entries;
  });

  const [hasMore, setHasMore] = useState(loaderData.initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<number | null>(loaderData.initialCursor ?? null);
  const themeIndexRef = useRef(loaderData.preloadedThemes?.length ?? 1);
  const loadedIdsRef = useRef<Set<number>>(new Set(loaderData.initialItems.map((item: FeedItem) => item.id)));
  const inFlightRef = useRef(false);

  useEffect(() => {
    document.body.style.backgroundColor = "#FFFFFF";
    document.body.style.color = "#2B2926";
    return () => {
      document.body.style.backgroundColor = "";
      document.body.style.color = "";
    };
  }, []);

  // Lazy-load spotlight client-side
  useEffect(() => {
    if (loaderData.spotlight) return;
    fetch("/api/spotlight")
      .then(r => r.json())
      .then(data => {
        if (!data) return;
        setFeed(prev => {
          if (prev.some(e => e.type === "spotlight")) return prev;
          const idx = Math.min(10, prev.length);
          const next = [...prev];
          next.splice(idx, 0, { type: "spotlight", ...data });
          return next;
        });
      })
      .catch(() => {});
  }, []);

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || !hasMore) return;
    inFlightRef.current = true;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/feed?filter=Alla&limit=20&cursor=${cursorRef.current ?? ""}`);
      if (!res.ok) throw new Error("Kunde inte hämta fler verk");
      const data = await res.json() as { items?: FeedItem[]; nextCursor?: number | null; hasMore?: boolean };
      const nextItems: FeedItem[] = (data.items || []).filter((item: FeedItem) => !loadedIdsRef.current.has(item.id));

      const newEntries: FeedEntry[] = nextItems.map((item) => ({ type: "art", item }));

      if (nextItems.length > 0) {
        const campaignThemes = getThemes(loaderData.campaignId);
        if (themeIndexRef.current < campaignThemes.length) {
          const theme = campaignThemes[themeIndexRef.current];
          try {
            const themeRes = await fetch(`/api/feed?filter=${encodeURIComponent(theme.filter)}&limit=8`);
            if (!themeRes.ok) throw new Error("Kunde inte hämta tema");
            const themeData = await themeRes.json() as { items?: FeedItem[] };
            if (themeData.items?.length) {
              const insertAt = Math.min(10, newEntries.length);
              newEntries.splice(insertAt, 0, {
                type: "theme",
                ...theme,
                items: themeData.items,
              });
            }
          } catch {
            // skip theme on error
          }
          themeIndexRef.current += 1;
        }
      }

      if (newEntries.length > 0) {
        setFeed((prev) => [...prev, ...newEntries]);
      }

      nextItems.forEach((item) => loadedIdsRef.current.add(item.id));
      cursorRef.current = data.nextCursor ?? null;
      setHasMore(Boolean(data.hasMore));
    } catch {
      setLoadError(uiText(uiLocale, "Kunde inte ladda fler verk just nu.", "Could not load more artworks right now."));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [hasMore, loaderData.campaignId, uiLocale]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
      />
      <div className="max-w-[1400px] mx-auto">
        <HeroSearch
          totalWorks={loaderData.stats.total}
          headline={loaderData.heroHeadline}
          subline={loaderData.heroSubline}
          introText={loaderData.heroIntro}
          isCampaign={loaderData.noindex}
          campaignId={loaderData.campaignId}
          museumCount={loaderData.stats.museums}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 px-3 md:px-4 lg:px-6">
          {(() => {
            let artIndex = -1;
            return feed.map((entry, index) => {
              if (entry.type === "art") {
                artIndex += 1;
                return (
                  <ArtworkCard
                    key={`art-${entry.item.id}-${index}`}
                    item={entry.item}
                    index={artIndex}
                    showMuseumBadge={loaderData.showMuseumBadge}
                  />
                );
              }

              if (entry.type === "spotlight") {
                return (
                  <div key={`spotlight-${entry.artistName}-${index}`} className="col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5">
                    <SpotlightCard spotlight={entry} />
                  </div>
                );
              }

              if (entry.type === "walkPromo") {
                return (
                  <div key={`walks-${index}`} className="col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5 border-t border-rule">
                    <WalkPromoCard campaignId={loaderData.campaignId} />
                  </div>
                );
              }

              return (
                <div key={`theme-${entry.title}-${index}`} className="col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5">
                  <ThemeCard section={entry} showMuseumBadge={loaderData.showMuseumBadge} />
                </div>
              );
            });
          })()}
        </div>

        <div ref={sentinelRef} className="h-px" />
        {loading && (
          <div aria-live="polite" className="text-center p-8 text-secondary text-[13px]">
            {uiText(uiLocale, "Laddar mer konst…", "Loading more artworks…")}
          </div>
        )}
        {loadError && !loading && (
          <div aria-live="polite" className="text-center p-8">
            <p className="text-secondary text-[13px] mb-3">{loadError}</p>
            <button
              type="button"
              onClick={() => { setLoadError(""); void loadMore(); }}
              className="px-4 py-2 bg-paper text-secondary text-[13px] hover:bg-rule hover:text-primary transition-colors focus-ring border-none cursor-pointer"
            >
              {uiText(uiLocale, "Försök igen", "Try again")}
            </button>
          </div>
        )}
    </div>
  );
}
