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
    <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-3 space-y-3">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={`search-skeleton-${index}`} className="break-inside-avoid">
          <div className="relative overflow-hidden rounded-card bg-dark-raised aspect-[3/4] animate-pulse">
            <div className="absolute inset-0 search-skeleton-shimmer" />
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
    dominant_color: result.color || result.dominant_color || "#D4CDC3",
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
    title_sv: item.title_sv || "Utan titel",
    title_en: null,
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
    <div className="relative mt-4">
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
            <div className="flex gap-2">
              <label htmlFor="search-input" className="sr-only">{uiText(uiLocale, "Sök", "Search")}</label>
              <input
                {...inputProps}
                ref={inputRef}
                id="search-input"
                type="search"
                name="q"
                placeholder={placeholder}
                className="flex-1 px-4 py-3 rounded-card bg-dark-raised text-dark-text placeholder:text-dark-text-muted
                       text-base border border-stone/20 focus:border-charcoal/40 focus:outline-none focus-ring [&::-webkit-search-cancel-button]:hidden"
              />
              <button
                type="submit"
                className="px-5 py-3 bg-charcoal text-cream rounded-card text-sm font-medium hover:bg-ink active:scale-[0.97] transition-[background-color,transform] shrink-0 focus-ring"
              >
                {uiText(uiLocale, "Sök", "Search")}
              </button>
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
      <p aria-live="polite" className="text-sm text-dark-text-secondary mb-6">
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
          <p className="text-sm text-dark-text-secondary mb-3">{uiText(uiLocale, "Förslag:", "Suggestions:")}</p>
          <ul className="list-none p-0 m-0 space-y-1 text-sm text-dark-text-muted">
            <li>• {uiText(uiLocale, "Kontrollera stavningen", "Check the spelling")}</li>
            <li>• {uiText(uiLocale, "Prova ett bredare sökord", "Try a broader query")}</li>
            <li>• {uiText(uiLocale, "Sök på svenska eller engelska", "Search in Swedish or English")}</li>
          </ul>
          <p className="text-sm text-dark-text-secondary mt-5 mb-3">{uiText(uiLocale, "Eller prova:", "Or try:")}</p>
          <div className="flex flex-wrap gap-2">
            {(uiLocale === "en"
              ? ["Landscape", "Portrait", "Still life", "Sculpture", "Watercolor"]
              : ["Landskap", "Porträtt", "Stilleben", "Skulptur", "Akvarell"]).map((s) => (
              <a key={s} href={`/search?q=${encodeURIComponent(s)}`}
                className="px-3 py-1.5 rounded-full bg-dark-raised text-dark-text-secondary text-sm font-medium hover:bg-dark-hover hover:text-dark-text transition-colors focus-ring"
              >{s}</a>
            ))}
          </div>
        </div>
      )}
      {searchType === "artist" && artistResults.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {artistResults.map((artist) => (
            <a
              key={artist.name}
              href={`/artist/${encodeURIComponent(artist.name)}`}
              className="rounded-card border border-stone/20 bg-dark-raised px-4 py-4 hover:bg-dark-hover transition-colors focus-ring"
            >
              <p className="text-base text-dark-text font-medium">{artist.name}</p>
              <p className="text-sm text-dark-text-secondary mt-1">{uiText(uiLocale, `${artist.artwork_count} verk`, `${formatUiNumber(artist.artwork_count, uiLocale)} works`)}</p>
            </a>
          ))}
        </div>
      )}
      {searchType !== "artist" && artworkResults.length > 0 && (
        <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-3 space-y-3">
          {artworkResults.map((r) => (
            <ArtworkCard
              key={r.id}
              item={toArtworkItem(r)}
              showMuseumBadge={showMuseumBadge}
              layout="search"
              yearLabel={r.year || r.dating_text || null}
              snippet={r.snippet || null}
              matchType={r.matchType}
            />
          ))}
        </div>
      )}
      {loadError && (
        <div className="text-center mt-8 py-4" aria-live="polite">
          <p className="text-sm text-dark-text-secondary mb-3">{uiText(uiLocale, "Kunde inte ladda fler resultat.", "Could not load more results.")}</p>
          <button
            type="button"
            onClick={() => { setLoadError(false); loadMore(); }}
            className="px-4 py-2 rounded-full bg-dark-raised text-dark-text-secondary text-sm font-medium hover:bg-dark-hover hover:text-dark-text transition-colors focus-ring"
          >
            {uiText(uiLocale, "Försök igen", "Try again")}
          </button>
        </div>
      )}
      {hasMore && !loadError && (
        <div ref={sentinelRef} className="text-center mt-8 py-4">
          {loading && <p aria-live="polite" className="text-sm text-dark-text-secondary">{uiText(uiLocale, "Laddar fler…", "Loading more…")}</p>}
        </div>
      )}
    </>
  );
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const uiLocale = useUiLocale();
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
  const searchIntro = searchType === "visual"
    ? uiText(uiLocale, "Bildsök är bäst för motiv och stämningar som porträtt, blå himmel eller storm. För namn, epoker och material fungerar Alla bättre.", "Visual search works best for motifs and moods like portraits, blue sky or storm. For names, periods and materials, All usually works better.")
    : searchType === "artist"
      ? uiText(uiLocale, "Sök efter konstnärer och formgivare. För motiv och stämningar fungerar Bildsök bättre.", "Search for artists and makers. For motifs and moods, Visual search works better.")
      : searchType === "artwork"
        ? uiText(uiLocale, "Sök efter verk med ord från titel, beskrivning och metadata. För motiv och stämningar fungerar Bildsök bättre.", "Search for artworks using words from title, description and metadata. For motifs and moods, Visual search works better.")
        : uiText(uiLocale, "Alla passar bäst för namn, epoker och material. För motiv och stämningar som porträtt, natt eller hav är Bildsök oftast starkare.", "All works best for names, periods and materials. For motifs and moods like portrait, night or sea, Visual search is usually stronger.");
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
    <div className="min-h-screen pt-14 bg-dark-base text-dark-text">
      <div className="px-(--spacing-page) pt-8 pb-4 md:max-w-6xl md:mx-auto md:px-6 lg:px-8">
        <h1 className="font-serif text-[2rem] text-dark-text mb-2">{uiText(uiLocale, "Sök", "Search")}</h1>
        <SearchAutocompleteForm
          defaultValue={query}
          museum={museum || undefined}
          searchType={searchType}
          autoFocus={shouldAutoFocus}
        />
        <p className="mt-3 max-w-3xl text-[0.84rem] leading-relaxed text-dark-text-muted">
          {searchIntro}
        </p>

        <div className="mt-5">
          <p className="text-[0.68rem] uppercase tracking-[0.08em] text-dark-text-muted mb-2.5">{uiText(uiLocale, "Typ", "Type")}</p>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all" as SearchType, label: uiText(uiLocale, "Alla", "All") },
              { id: "artwork" as SearchType, label: uiText(uiLocale, "Verk", "Artworks") },
              { id: "artist" as SearchType, label: uiText(uiLocale, "Konstnärer", "Artists") },
              { id: "visual" as SearchType, label: uiText(uiLocale, "Bildsök", "Visual search") },
            ].map((option) => (
              <a
                key={option.id}
                href={buildSearchUrl({ type: option.id, museumId: museum })}
                className={[
                  "px-3.5 py-[0.4rem] rounded-full text-[0.8rem] font-medium transition-colors inline-flex items-center",
                  "focus-ring",
                  searchType === option.id
                    ? "bg-charcoal text-cream"
                    : "bg-dark-raised text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text",
                ].join(" ")}
              >
                {option.label}
              </a>
            ))}
          </div>
        </div>

        {showMuseumFilters && (
          <div className="mt-4">
            <p className="text-[0.68rem] uppercase tracking-[0.08em] text-dark-text-muted mb-2.5">{uiText(uiLocale, "Samlingar", "Collections")}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={buildSearchUrl({ type: searchType })}
                className={[
                  "px-3.5 py-[0.4rem] rounded-full text-[0.8rem] font-medium transition-colors inline-flex items-center",
                  "focus-ring",
                  museum
                    ? "bg-dark-raised text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text"
                    : "bg-charcoal text-cream",
                ].join(" ")}
              >
                {uiText(uiLocale, "Alla", "All")}
              </a>
              {museumOptions.map((option: MuseumOption) => (
                <a
                  key={option.id}
                  href={buildSearchUrl({ museumId: option.id })}
                  className={[
                    "px-3.5 py-[0.4rem] rounded-full text-[0.8rem] font-medium transition-colors inline-flex items-center",
                    "focus-ring",
                    museum === option.id
                      ? "bg-charcoal text-cream"
                      : "bg-dark-raised text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text",
                  ].join(" ")}
                >
                  {option.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {!query && (
          <div className="mt-6">
            <p className="text-[0.68rem] uppercase tracking-[0.08em] text-dark-text-muted mb-3">{uiText(uiLocale, "Prova", "Try")}</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQueries.map(s => (
                <a key={s} href={buildSearchUrl({ queryValue: s, museumId: museum, type: searchType })}
                  className="px-3.5 py-[0.4rem] inline-flex items-center rounded-full bg-dark-raised text-dark-text-secondary text-[0.8rem] font-medium
                             hover:bg-dark-hover hover:text-dark-text transition-colors focus-ring">{s}</a>
              ))}
            </div>
          </div>
        )}
      </div>

      {showResults && (
        <div className="px-(--spacing-page) pb-24 md:max-w-6xl md:mx-auto md:px-6 lg:px-8">
          <Suspense fallback={<SearchResultsSkeleton />}>
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
