import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { Await, data, useNavigate } from "react-router";
import type { Route } from "./+types/search";
import Autocomplete, { type AutocompleteSuggestion } from "../components/Autocomplete";
import ArtworkCard from "../components/ArtworkCard";
import type { ArtworkDisplayItem } from "../components/artwork-meta";
import { buildImageUrl } from "../lib/images";
import {
  searchLoader,
  type SearchLoaderData,
  type SearchResult,
  type SearchMode,
  type SearchType,
  type MuseumOption,
  type SearchResultsPayload,
  type ArtworkSearchResult,
  type ArtistSearchResult,
  type SearchResultItem,
} from "./search.loader.server";
import { PAGE_SIZE } from "../lib/search-constants";
import { formatUiNumber, uiText, useUiLocale } from "../lib/ui-language";

const THEME_FILTERS: Record<string, string> = {
  "djur": "Djur",
  "animals": "Djur",
  "havet": "Havet",
  "sea": "Havet",
  "blommor": "Blommor",
  "flowers": "Blommor",
  "natt": "Natt",
  "night": "Natt",
  "rött": "Rött",
  "red": "Rött",
  "blått": "Blått",
  "blue": "Blått",
  "porträtt": "Porträtt",
  "portrait": "Porträtt",
  "portraits": "Porträtt",
  "1700-tal": "1700-tal",
  "18th century": "1700-tal",
  "1800-tal": "1800-tal",
  "19th century": "1800-tal",
  "skulptur": "Skulptur",
  "sculpture": "Skulptur",
};

function resolveThemeFilter(query: string): string | null {
  return THEME_FILTERS[query.trim().toLowerCase()] || null;
}

export function headers() {
  return { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };
}

export function meta({ data }: Route.MetaArgs) {
  const q = data?.query || "";
  const isEnglish = data?.uiLocale === "en";
  return [
    { title: q ? `"${q}" — Kabinett` : isEnglish ? "Search — Kabinett" : "Sök — Kabinett" },
    { name: "description", content: isEnglish ? "Search hundreds of thousands of works from museums with AI that understands what you mean." : "Sök bland hundratusentals verk från Sveriges museer — med AI som förstår vad du letar efter." },
  ];
}

export function loader({ request }: Route.LoaderArgs) {
  return data(searchLoader(request));
}

function SearchResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={`search-skeleton-${index}`}>
          <div className="bg-paper aspect-square rounded-card" />
          <div className="p-3">
            <div className="h-4 bg-paper w-3/4" />
            <div className="h-3 bg-paper w-1/2 mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function toArtworkItem(result: ArtworkSearchResult): ArtworkDisplayItem {
  const title = result.title || result.title_sv || result.title_en || "Utan titel";
  const imageUrl = result.imageUrl || (result.iiif_url ? buildImageUrl(result.iiif_url, 400) : "");
  return {
    id: result.id,
    title_sv: title,
    artists: result.artists || (result.artist ? JSON.stringify([{ name: result.artist }]) : null),
    artist_name: result.artist || null,
    dating_text: result.year || result.dating_text || null,
    iiif_url: result.iiif_url || "",
    dominant_color: result.color || result.dominant_color || "#E0DEDA",
    category: null,
    technique_material: null,
    imageUrl,
    museum_name: result.museum_name || null,
    focal_x: result.focal_x ?? null,
    focal_y: result.focal_y ?? null,
  };
}

type ThemeFeedItem = {
  id: number;
  title_sv?: string | null;
  title_en?: string | null;
  iiif_url?: string | null;
  dominant_color?: string | null;
  artists?: string | null;
  dating_text?: string | null;
  technique_material?: string | null;
  museum_name?: string | null;
  focal_x?: number | null;
  focal_y?: number | null;
  imageUrl?: string;
};

function mapThemeFeedItemToSearchResult(item: ThemeFeedItem): ArtworkSearchResult {
  return {
    resultType: "artwork",
    id: item.id,
    title_sv: item.title_sv || item.title_en || "Utan titel",
    title_en: item.title_en || null,
    iiif_url: item.iiif_url || null,
    dominant_color: item.dominant_color || null,
    artists: item.artists || null,
    dating_text: item.dating_text || null,
    technique_material: item.technique_material || null,
    museum_name: item.museum_name || null,
    focal_x: item.focal_x ?? null,
    focal_y: item.focal_y ?? null,
    imageUrl: item.imageUrl || undefined,
    snippet: null,
  };
}

function SearchAutocompleteForm({
  defaultValue,
  museum,
  searchType = "all",
  autoFocus = false,
}: {
  defaultValue: string;
  museum?: string;
  searchType?: SearchType;
  autoFocus?: boolean;
}) {
  const uiLocale = useUiLocale();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(defaultValue);

  useEffect(() => {
    setQuery(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!autoFocus) return;
    const input = inputRef.current;
    if (!input) return;
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }, [autoFocus]);

  const submitSearch = useCallback((value: string) => {
    const trimmed = value.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    if (museum) params.set("museum", museum);
    if (searchType !== "all") params.set("type", searchType);
    const qs = params.toString();
    navigate(qs ? `/search?${qs}` : "/search");
  }, [museum, navigate, searchType]);

  const handleSelect = useCallback((suggestion: AutocompleteSuggestion) => {
    const value = suggestion.type === "artwork" ? suggestion.title : suggestion.value;
    submitSearch(value);
  }, [submitSearch]);

  const buildAutocompleteUrl = useCallback((value: string) => {
    const params = new URLSearchParams({ q: value });
    if (museum) params.set("museum", museum);
    return `/api/autocomplete?${params.toString()}`;
  }, [museum]);

  const placeholder = searchType === "visual"
    ? uiText(uiLocale, "porträtt, blå himmel, storm…", "portrait, blue sky, storm…")
    : searchType === "artist"
      ? "Carl Larsson, Hilma af Klint…"
      : uiText(uiLocale, "Konstnär, titel, teknik…", "Artist, title, medium…");

  return (
    <div className="relative">
      <Autocomplete
        query={query}
        onQueryChange={setQuery}
        onSelect={handleSelect}
        buildRequestUrl={buildAutocompleteUrl}
      >
        {({ inputProps }) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              inputRef.current?.blur();
              submitSearch(query);
            }}
          >
            <label htmlFor="search-input" className="sr-only">{uiText(uiLocale, "Sök", "Search")}</label>
            <div className="flex items-center border border-rule rounded-card bg-white px-5 py-3.5 has-[:focus-visible]:border-secondary transition-colors">
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="text-secondary shrink-0 mr-3"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                {...inputProps}
                ref={inputRef}
                id="search-input"
                type="search"
                name="q"
                placeholder={placeholder}
                className="flex-1 bg-transparent text-primary placeholder:text-secondary
                       text-[16px] px-0 py-0 border-none outline-none [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
          </form>
        )}
      </Autocomplete>
    </div>
  );
}

function SearchResultsPanel({
  initialPayload,
  query,
  museum,
  searchMode,
  searchType,
  showMuseumBadge,
}: {
  initialPayload: SearchResultsPayload;
  query: string;
  museum: string;
  searchMode: SearchMode;
  searchType: SearchType;
  showMuseumBadge: boolean;
}) {
  const uiLocale = useUiLocale();
  const { results: initialResults, cursor: initialCursor } = initialPayload;
  const displayQuery = query;
  const [results, setResults] = useState<SearchResultItem[]>(initialResults);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cursor, setCursor] = useState<number | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialCursor !== null);

  useEffect(() => {
    setResults(initialResults);
    setCursor(initialCursor);
    setHasMore(initialCursor !== null);
  }, [initialCursor, initialResults]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !query || cursor === null) return;
    setLoading(true);
    setLoadError(false);
    try {
      if (searchMode === "theme") {
        const themeFilter = resolveThemeFilter(query);
        if (!themeFilter) {
          setHasMore(false);
          setCursor(null);
          return;
        }
        const params = new URLSearchParams({
          filter: themeFilter,
          limit: String(PAGE_SIZE),
          cursor: String(cursor),
        });
        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) throw new Error("Kunde inte ladda fler tema-träffar");
        const data = await res.json() as { items?: ThemeFeedItem[]; nextCursor?: number | null; hasMore?: boolean };
        const mapped = (data.items || []).map(mapThemeFeedItemToSearchResult);
        if (mapped.length === 0) {
          setHasMore(false);
          setCursor(null);
        } else {
          setResults((prev) => [...prev, ...mapped]);
          const hasNext = Boolean(data.hasMore);
          const nextCursor = hasNext ? (data.nextCursor ?? null) : null;
          setHasMore(hasNext && nextCursor !== null);
          setCursor(nextCursor);
        }
        return;
      }

      const params = new URLSearchParams({
        q: query,
        limit: String(PAGE_SIZE),
        offset: String(cursor),
        mode: searchMode,
        type: searchType,
      });
      if (museum) params.set("museum", museum);

      const res = await fetch(`/api/clip-search?${params.toString()}`);
      const data = await res.json() as SearchResult[];
      const mapped: ArtworkSearchResult[] = data.map((item) => ({
        ...item,
        resultType: "artwork",
      }));
      if (data.length === 0) {
        setHasMore(false);
        setCursor(null);
      } else {
        setResults((prev) => [...prev, ...mapped]);
        const next = cursor + data.length;
        if (data.length < PAGE_SIZE) {
          setHasMore(false);
          setCursor(null);
        } else {
          setCursor(next);
        }
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, hasMore, loading, museum, query, searchMode, searchType]);

  const artistResults = results.filter((result): result is ArtistSearchResult => result.resultType === "artist");
  const artworkResults = results.filter((result): result is ArtworkSearchResult => result.resultType === "artwork");

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <>
      <div className="px-4 md:px-6 lg:px-10">
        <p aria-live="polite" className="text-[13px] text-secondary mb-6">
          {results.length > 0
            ? uiText(
              uiLocale,
              `${results.length}${hasMore ? "+" : ""} träffar${displayQuery ? ` för "${displayQuery}"` : ""}`,
              `${formatUiNumber(results.length, uiLocale)}${hasMore ? "+" : ""} results${displayQuery ? ` for "${displayQuery}"` : ""}`
            )
            : uiText(uiLocale, `Inga träffar${displayQuery ? ` för "${displayQuery}"` : ""}`, `No results${displayQuery ? ` for "${displayQuery}"` : ""}`)}
        </p>
        {results.length === 0 && displayQuery && (
          <div className="py-4">
            <p className="text-[13px] text-secondary mb-3">{uiText(uiLocale, "Förslag:", "Suggestions:")}</p>
            <ul className="list-none p-0 m-0 space-y-1 text-[13px] text-secondary">
              <li>• {uiText(uiLocale, "Kontrollera stavningen", "Check the spelling")}</li>
              <li>• {uiText(uiLocale, "Prova ett bredare sökord", "Try a broader query")}</li>
              <li>• {uiText(uiLocale, "Sök på svenska eller engelska", "Search in Swedish or English")}</li>
            </ul>
            <p className="text-[13px] text-secondary mt-5 mb-3">{uiText(uiLocale, "Eller prova:", "Or try:")}</p>
            <p className="text-[13px] text-secondary">
              {(uiLocale === "en"
                ? ["Landscape", "Portrait", "Still life", "Sculpture", "Watercolor"]
                : ["Landskap", "Porträtt", "Stilleben", "Skulptur", "Akvarell"]).map((s, i) => (
                <span key={s}>
                  {i > 0 && ", "}
                  <a href={`/search?q=${encodeURIComponent(s)}`}
                    className="text-secondary hover:text-primary transition-colors underline decoration-rule underline-offset-2 focus-ring"
                  >{s}</a>
                </span>
              ))}
            </p>
          </div>
        )}
      </div>
      {searchType === "artist" && artistResults.length > 0 && (
        <div className="px-4 md:px-6 lg:px-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8">
            {artistResults.map((artist) => (
              <a
                key={artist.name}
                href={`/artist/${encodeURIComponent(artist.name)}`}
                className="flex items-center justify-between py-3 border-b border-rule no-underline hover:text-primary transition-colors focus-ring"
              >
                <p className="text-[15px] text-primary">{artist.name}</p>
                <p className="text-[13px] text-secondary">{uiText(uiLocale, `${artist.artwork_count} verk`, `${formatUiNumber(artist.artwork_count, uiLocale)} works`)}</p>
              </a>
            ))}
          </div>
        </div>
      )}
      {searchType !== "artist" && artworkResults.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 px-3 md:px-4 lg:px-6">
          {artworkResults.map((r, i) => (
            <ArtworkCard
              key={r.id}
              item={toArtworkItem(r)}
              showMuseumBadge={showMuseumBadge}
              index={i}
              yearLabel={r.year || r.dating_text || null}
              snippet={r.snippet || null}
              matchType={r.matchType}
              variant="light"
            />
          ))}
        </div>
      )}
      {loadError && (
        <div className="text-center mt-8 py-4" aria-live="polite">
          <p className="text-[13px] text-secondary mb-3">{uiText(uiLocale, "Kunde inte ladda fler resultat.", "Could not load more results.")}</p>
          <button
            type="button"
            onClick={() => { setLoadError(false); loadMore(); }}
            className="px-4 py-2 bg-paper text-secondary text-[13px] hover:bg-rule hover:text-primary transition-colors focus-ring border-none cursor-pointer"
          >
            {uiText(uiLocale, "Försök igen", "Try again")}
          </button>
        </div>
      )}
      {hasMore && !loadError && (
        <div ref={sentinelRef} className="text-center mt-8 py-4">
          {loading && <p aria-live="polite" className="text-[13px] text-secondary">{uiText(uiLocale, "Laddar fler…", "Loading more…")}</p>}
        </div>
      )}
    </>
  );
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const uiLocale = useUiLocale();
  const navigate = useNavigate();
  const typedLoaderData = loaderData as SearchLoaderData;
  const {
    query,
    museum,
    results: initialResultsPromise,
    museumOptions,
    showMuseumBadge,
    searchMode,
    searchType,
    shouldAutoFocus,
  } = typedLoaderData;

  const showResults = Boolean(query) || Boolean(museum);
  const showMuseumFilters = museumOptions.length > 1 && searchMode !== "theme";

  const suggestedQueries = searchType === "visual"
    ? (uiLocale === "en"
      ? ["Portrait", "Landscape", "Flowers", "Storm", "Blue sky", "Gold", "Horse", "Winter", "Forest", "Still life"]
      : ["Porträtt", "Landskap", "Blommor", "Storm", "Blå himmel", "Guld", "Häst", "Vinter", "Skog", "Stilleben"])
    : searchType === "artist"
      ? ["Carl Larsson", "Rembrandt", "Bruno Liljefors", "Hilma af Klint", "Anders Zorn"]
      : (uiLocale === "en"
        ? ["Carl Larsson", "Rembrandt", "Oil on canvas", "Watercolor", "Portrait", "Landscape", "Sculpture", "18th century", "Gold", "Winter"]
        : ["Carl Larsson", "Rembrandt", "Olja på duk", "Akvarell", "Porträtt", "Landskap", "Skulptur", "1700-tal", "Guld", "Vinter"]);

  const buildSearchUrl = ({
    queryValue = query,
    museumId,
    type = searchType,
  }: {
    queryValue?: string;
    museumId?: string;
    type?: SearchType;
  } = {}) => {
    const params = new URLSearchParams();
    if (queryValue) params.set("q", queryValue);
    if (museumId) params.set("museum", museumId);
    if (type !== "all") params.set("type", type);
    if (type === "all" && searchMode !== "clip") params.set("mode", searchMode);
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  };

  return (
    <div className="min-h-screen pt-16 bg-white text-primary">
      <div className="px-4 pt-8 pb-4 md:px-6 lg:px-10">
        <h1 className="text-[32px] text-primary leading-[1.3]">{uiText(uiLocale, "Sök", "Search")}</h1>
        <p className="text-[15px] text-secondary mt-1 mb-6">{uiText(uiLocale, "Sök bland hundratusentals verk", "Search hundreds of thousands of works")}</p>
        <SearchAutocompleteForm
          defaultValue={query}
          museum={museum || undefined}
          searchType={searchType}
          autoFocus={shouldAutoFocus}
        />

        <div className={showMuseumFilters ? "mt-5 grid gap-4 lg:grid-cols-[max-content_minmax(20rem,1fr)] lg:items-end" : "mt-5"}>
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-2">{uiText(uiLocale, "Typ", "Type")}</p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "all" as SearchType, label: uiText(uiLocale, "Alla", "All") },
                { id: "artwork" as SearchType, label: uiText(uiLocale, "Verk", "Artworks") },
                { id: "artist" as SearchType, label: uiText(uiLocale, "Konstnärer", "Artists") },
                { id: "visual" as SearchType, label: uiText(uiLocale, "Bildsök", "Visual") },
              ].map((option) => (
                <a
                  key={option.id}
                  href={buildSearchUrl({ type: option.id, museumId: museum })}
                  className={[
                    "shrink-0 px-3.5 py-1.5 text-[13px] border rounded-card transition-colors focus-ring no-underline",
                    searchType === option.id
                      ? "border-primary bg-primary text-white"
                      : "border-rule text-secondary hover:text-primary hover:border-secondary",
                  ].join(" ")}
                >
                  {option.label}
                </a>
              ))}
            </div>
          </div>

          {showMuseumFilters && (
            <div>
              <label htmlFor="collection-filter" className="block text-[11px] uppercase tracking-[0.08em] text-secondary mb-2">
                {uiText(uiLocale, "Samling", "Collection")}
              </label>
              <div className="relative rounded-card border border-rule bg-white transition-colors has-[:focus-visible]:border-secondary">
                <select
                  id="collection-filter"
                  value={museum}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value || undefined;
                    navigate(buildSearchUrl({ museumId: nextValue, type: searchType }));
                  }}
                  className="w-full appearance-none border-0 bg-transparent px-4 py-3 pr-11 text-[14px] text-primary outline-none ring-0 shadow-none focus:outline-none focus:ring-0"
                >
                  <option value="">{uiText(uiLocale, "Alla samlingar", "All collections")}</option>
                  {museumOptions.map((option: MuseumOption) => (
                  <option key={option.id} value={option.id}>
                      {option.name}
                  </option>
                ))}
              </select>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-secondary"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="block">
                    <path d="M3 5.5 7 9l4-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </div>
          )}
        </div>

        {!query && (
          <div className="mt-6">
            <p className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-2">{uiText(uiLocale, "Prova", "Try")}</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedQueries.map((s) => (
                <a
                  key={s}
                  href={buildSearchUrl({ queryValue: s, museumId: museum, type: searchType })}
                  className="px-3 py-1 bg-paper text-[13px] text-secondary hover:text-primary transition-colors focus-ring rounded-card no-underline"
                >{s}</a>
              ))}
            </div>
          </div>
        )}
      </div>

      {showResults && (
        <div className="pb-24">
          <Suspense fallback={<div className="px-4 md:px-6 lg:px-10"><SearchResultsSkeleton /></div>}>
            <Await resolve={initialResultsPromise}>
              {(initialPayload: SearchResultsPayload) => (
                <SearchResultsPanel
                  initialPayload={initialPayload}
                  query={query}
                  museum={museum}
                  searchMode={searchMode}
                  searchType={searchType}
                  showMuseumBadge={showMuseumBadge}
                />
              )}
            </Await>
          </Suspense>
        </div>
      )}
    </div>
  );
}
