import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Await, Link, data, useNavigate } from "react-router";
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

const VISUAL_SEARCH_TIMEOUT_MS = 45_000;

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

function SearchResultsError({ retryUrl }: { retryUrl: string }) {
  const uiLocale = useUiLocale();

  return (
    <div className="px-4 md:px-6 lg:px-10 py-6" aria-live="polite">
      <div className="max-w-xl rounded-card border border-rule bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <p className="text-[16px] text-primary">
          {uiText(uiLocale, "Kunde inte ladda sökresultaten just nu.", "Couldn't load the search results right now.")}
        </p>
        <p className="mt-2 text-[13px] text-secondary">
          {uiText(uiLocale, "Försök igen om en liten stund.", "Try again in a moment.")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={retryUrl}
            className="inline-flex items-center rounded-card bg-primary px-4 py-2 text-[13px] text-white no-underline transition-colors hover:opacity-90 focus-ring"
          >
            {uiText(uiLocale, "Försök igen", "Try again")}
          </Link>
          <Link
            to="/"
            className="inline-flex items-center rounded-card border border-[#C8C3BC] px-4 py-2 text-[13px] text-secondary no-underline transition-colors hover:text-primary hover:border-secondary focus-ring"
          >
            {uiText(uiLocale, "Till startsidan", "Go to home")}
          </Link>
        </div>
      </div>
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
    if (searchType !== "all") params.set("type", searchType);
    return `/api/autocomplete?${params.toString()}`;
  }, [museum, searchType]);

  const placeholder = uiText(uiLocale, "Beskriv vad du letar efter…", "Describe what you're looking for…");

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
            <div className="flex items-center border border-[#C8C3BC] rounded-card bg-white px-5 py-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] has-[:focus-visible]:border-secondary transition-colors">
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

function CollectionFilter({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: MuseumOption[];
  onSelect: (museumId?: string) => void;
}) {
  const uiLocale = useUiLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedOption = options.find((option) => option.id === value) || null;

  const filteredOptions = useMemo(() => {
    const normalized = filterQuery.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.name.toLowerCase().includes(normalized));
  }, [filterQuery, options]);

  useEffect(() => {
    if (!isOpen) {
      setFilterQuery("");
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const currentLabel = selectedOption?.name || uiText(uiLocale, "Alla samlingar", "All collections");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id="collection-filter"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        className="flex w-full items-center justify-between rounded-card border border-[#C8C3BC] bg-white px-4 py-2 text-left text-[14px] text-primary transition-colors shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:border-secondary focus-ring"
      >
        <span className="truncate pr-4">{currentLabel}</span>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={`shrink-0 text-secondary transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="M3 5.5 7 9l4-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-rule bg-white shadow-[0_18px_48px_rgba(26,25,23,0.12)]">
          <div className="border-b border-rule px-3 py-3">
            <label htmlFor="collection-filter-search" className="sr-only">
              {uiText(uiLocale, "Filtrera samlingar", "Filter collections")}
            </label>
            <input
              id="collection-filter-search"
              ref={searchInputRef}
              type="search"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.currentTarget.value)}
              placeholder={uiText(uiLocale, "Filtrera samlingar…", "Filter collections…")}
              className="w-full border border-[#C8C3BC] bg-white px-3 py-2 text-[14px] text-primary outline-none transition-colors focus:border-secondary"
            />
          </div>

          <div role="listbox" aria-labelledby="collection-filter" className="max-h-80 overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              onClick={() => {
                setIsOpen(false);
                onSelect(undefined);
              }}
              className={[
                "flex w-full items-center px-4 py-2.5 text-left text-[14px] transition-colors",
                value === ""
                  ? "bg-paper text-primary"
                  : "text-primary hover:bg-paper",
              ].join(" ")}
            >
              {uiText(uiLocale, "Alla samlingar", "All collections")}
            </button>

            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={value === option.id}
                  onClick={() => {
                    setIsOpen(false);
                    onSelect(option.id);
                  }}
                  className={[
                    "flex w-full items-center px-4 py-2.5 text-left text-[14px] transition-colors",
                    value === option.id
                      ? "bg-paper text-primary"
                      : "text-primary hover:bg-paper",
                  ].join(" ")}
                >
                  {option.name}
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-[13px] text-secondary">
                {uiText(uiLocale, "Inga samlingar matchar.", "No collections match.")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchResultsPanel({
  initialPayload,
  pendingPayloadPromise,
  query,
  museum,
  searchMode,
  searchType,
  showMuseumBadge,
}: {
  initialPayload: SearchResultsPayload;
  pendingPayloadPromise?: Promise<SearchResultsPayload> | null;
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
  const [isRefining, setIsRefining] = useState(searchType === "visual" && Boolean(query));

  useEffect(() => {
    setResults(initialResults);
    setCursor(initialCursor);
    setHasMore(initialCursor !== null);
    setIsRefining(searchType === "visual" && Boolean(query));
  }, [initialCursor, initialResults, pendingPayloadPromise, query, searchType]);

  useEffect(() => {
    if (searchType === "visual") {
      return;
    }

    if (!pendingPayloadPromise) {
      setIsRefining(false);
      return;
    }

    let cancelled = false;
    setIsRefining(true);

    void pendingPayloadPromise
      .then((nextPayload) => {
        if (cancelled) return;

        const keepInitialResults = initialResults.length > 0 && nextPayload.results.length === 0;
        if (!keepInitialResults) {
          setResults(nextPayload.results);
        }
        setCursor(keepInitialResults ? null : nextPayload.cursor);
        setHasMore(!keepInitialResults && nextPayload.cursor !== null);
        setLoadError(false);
        setIsRefining(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsRefining(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialResults.length, pendingPayloadPromise, searchType]);

  useEffect(() => {
    if (searchType !== "visual" || !query) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), VISUAL_SEARCH_TIMEOUT_MS);
    setIsRefining(true);
    setLoadError(false);

    const params = new URLSearchParams({
      q: query,
      limit: String(PAGE_SIZE),
      type: "visual",
    });
    if (museum) params.set("museum", museum);

    void fetch(`/api/clip-search?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Kunde inte ladda bildsökning");
        const data = await response.json() as SearchResult[];
        if (cancelled) return;

        const mapped: ArtworkSearchResult[] = data.map((item) => ({
          ...item,
          resultType: "artwork",
        }));
        const keepInitialResults = initialResults.length > 0 && mapped.length === 0;
        if (!keepInitialResults) {
          setResults(mapped);
        }
        setCursor(keepInitialResults ? null : data.length >= PAGE_SIZE ? data.length : null);
        setHasMore(!keepInitialResults && data.length >= PAGE_SIZE);
        setLoadError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCursor(null);
        setHasMore(false);
        setLoadError(initialResults.length === 0);
      })
      .finally(() => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        setIsRefining(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [initialResults.length, museum, query, searchType]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || isRefining || !hasMore || !query || cursor === null) return;
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
  }, [cursor, hasMore, isRefining, loading, museum, query, searchMode, searchType]);

  const artistResults = results.filter((result): result is ArtistSearchResult => result.resultType === "artist");
  const artworkResults = results.filter((result): result is ArtworkSearchResult => result.resultType === "artwork");

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || isRefining) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isRefining, loadMore]);

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
            : isRefining
              ? uiText(
                uiLocale,
                `Söker visuellt${displayQuery ? ` efter "${displayQuery}"` : ""}…`,
                `Searching visually${displayQuery ? ` for "${displayQuery}"` : ""}…`
              )
              : uiText(uiLocale, `Inga träffar${displayQuery ? ` för "${displayQuery}"` : ""}`, `No results${displayQuery ? ` for "${displayQuery}"` : ""}`)}
        </p>
        {isRefining && searchType === "visual" && results.length > 0 && (
          <p aria-live="polite" className="text-[13px] text-secondary mb-6">
            {uiText(uiLocale, "Visar preliminära träffar medan bildsökningen förfinas…", "Showing preliminary results while visual search is refined…")}
          </p>
        )}
        {results.length === 0 && displayQuery && !isRefining && (
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
                  <Link
                    to={`/search?q=${encodeURIComponent(s)}`}
                    className="text-secondary hover:text-primary transition-colors underline decoration-rule underline-offset-2 focus-ring"
                  >{s}</Link>
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
    initialPayload,
    results: initialResultsPromise,
    museumOptions,
    showMuseumBadge,
    searchMode,
    searchType,
    shouldAutoFocus,
  } = typedLoaderData;

  const showResults = Boolean(query) || Boolean(museum);
  const showMuseumFilters = museumOptions.length > 1 && searchMode !== "theme";
  const visualInitialPayload = searchType === "visual"
    ? (initialPayload ?? { results: [], total: 0, cursor: null })
    : null;

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
  const retryUrl = buildSearchUrl();

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

        {!query && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-2">{uiText(uiLocale, "Prova", "Try")}</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedQueries.map((s) => (
                <Link
                  key={s}
                  to={buildSearchUrl({ queryValue: s, museumId: museum, type: searchType })}
                  className="px-4 py-2 bg-paper text-[13px] text-secondary hover:text-primary transition-colors focus-ring rounded-card no-underline"
                >{s}</Link>
              ))}
            </div>
          </div>
        )}

        <div className={showMuseumFilters ? "mt-5 grid gap-4 lg:grid-cols-[max-content_minmax(20rem,1fr)] lg:items-start" : "mt-5"}>
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-2">{uiText(uiLocale, "Typ", "Type")}</p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "all" as SearchType, label: uiText(uiLocale, "Alla", "All") },
                { id: "artwork" as SearchType, label: uiText(uiLocale, "Verk", "Artworks") },
                { id: "artist" as SearchType, label: uiText(uiLocale, "Konstnärer", "Artists") },
                { id: "visual" as SearchType, label: uiText(uiLocale, "Bildsök", "Visual") },
              ].map((option) => (
                <Link
                  key={option.id}
                  to={buildSearchUrl({ type: option.id, museumId: museum })}
                  className={[
                    "shrink-0 px-4 py-2 text-[13px] border rounded-card transition-colors focus-ring no-underline",
                    searchType === option.id
                      ? "border-primary bg-primary text-white"
                      : "border-[#C8C3BC] text-secondary hover:text-primary hover:border-secondary",
                  ].join(" ")}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          {showMuseumFilters && (
            <div>
              <label htmlFor="collection-filter" className="block text-[11px] uppercase tracking-[0.08em] text-secondary mb-2">
                {uiText(uiLocale, "Samling", "Collection")}
              </label>
              <CollectionFilter
                value={museum}
                options={museumOptions}
                onSelect={(nextValue) => {
                  navigate(buildSearchUrl({ museumId: nextValue, type: searchType }));
                }}
              />
            </div>
          )}
        </div>

      </div>

      {showResults && (
        <div className="pb-24">
          {searchType === "visual" && visualInitialPayload ? (
            <SearchResultsPanel
              initialPayload={visualInitialPayload}
              pendingPayloadPromise={initialResultsPromise}
              query={query}
              museum={museum}
              searchMode={searchMode}
              searchType={searchType}
              showMuseumBadge={showMuseumBadge}
            />
          ) : (
            <Suspense fallback={<div className="px-4 md:px-6 lg:px-10"><SearchResultsSkeleton /></div>}>
              <Await
                resolve={initialResultsPromise}
                errorElement={<SearchResultsError retryUrl={retryUrl} />}
              >
                {(resolvedPayload: SearchResultsPayload) => (
                  <SearchResultsPanel
                    initialPayload={resolvedPayload}
                    query={query}
                    museum={museum}
                    searchMode={searchMode}
                    searchType={searchType}
                    showMuseumBadge={showMuseumBadge}
                  />
                )}
              </Await>
            </Suspense>
          )}
        </div>
      )}
    </div>
  );
}
