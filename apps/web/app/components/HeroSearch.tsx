import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Autocomplete from "./Autocomplete";
import type { AutocompleteSuggestion } from "./Autocomplete";
import type { CampaignId } from "../lib/campaign.server";
import { formatUiNumber, uiText, useUiLocale } from "../lib/ui-language";

const HERO_SUGGESTIONS: Record<CampaignId, readonly string[]> = {
  default: ["äpple", "röd klänning", "solnedgång", "guld", "barn som leker", "hav"],
  europeana: ["apple", "children playing", "stormy sea", "portrait", "1950s dress"],
  nationalmuseum: ["stilleben", "porträtt", "landskap", "guld", "blommor", "storm"],
  nordiska: ["allmogemöbler", "samiska föremål", "folkdräkt", "Stockholm", "leksaker", "Skansen"],
  shm: ["vikingasvärd", "krona", "runsten", "rustning", "silver", "medeltid"],
};

export default function HeroSearch({
  totalWorks,
  headline,
  subline,
  introText,
  isCampaign,
  campaignId = "default",
  museumCount,
}: {
  totalWorks: number;
  headline?: string;
  subline?: string;
  introText?: string | null;
  isCampaign?: boolean;
  campaignId?: CampaignId;
  museumCount?: number;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const uiLocale = useUiLocale();
  const suggestions = HERO_SUGGESTIONS[campaignId] || HERO_SUGGESTIONS.default;
  const placeholder = campaignId === "europeana"
    ? "Describe what you're looking for…"
    : uiText(uiLocale, "Beskriv vad du letar efter…", "Describe what you're looking for…");

  const formattedTotal = formatUiNumber(totalWorks, uiLocale);
  const defaultHeadline = museumCount
    ? uiText(uiLocale, `${formattedTotal} verk från ${museumCount} samlingar`, `${formattedTotal} artworks from ${museumCount} collections`)
    : `${formattedTotal} ${uiText(uiLocale, "konstverk", "artworks")}`;

  const handleFocus = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    window.scrollTo(0, 0);
    if (typeof el.setSelectionRange === "function") {
      requestAnimationFrame(() => {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      });
    }
  }, []);

  const buildAutocompleteUrl = useCallback((value: string) => {
    const params = new URLSearchParams({
      q: value,
      type: "visual",
    });
    return `/api/autocomplete?${params.toString()}`;
  }, []);

  const goToSearch = useCallback(
    (q: string, type: "all" | "visual" = "visual") => {
      const trimmed = q.trim();
      if (!trimmed) return;
      inputRef.current?.blur();
      const params = new URLSearchParams({ q: trimmed });
      if (type !== "all") params.set("type", type);
      navigate(`/search?${params.toString()}`);
    },
    [navigate]
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      if (suggestion.type === "artwork") {
        inputRef.current?.blur();
        navigate(`/artwork/${suggestion.id}`);
        return;
      }
      if (suggestion.type === "artist") {
        inputRef.current?.blur();
        navigate(`/artist/${encodeURIComponent(suggestion.value)}`);
        return;
      }
      goToSearch(suggestion.value, "visual");
    },
    [goToSearch, navigate]
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const inputValue = inputRef.current?.value || query;
      goToSearch(inputValue, "visual");
    },
    [query, goToSearch]
  );

  return (
    <div className="pt-[5rem] pb-10 px-4 md:px-6 lg:px-10 lg:pt-[6rem] lg:pb-14 flex flex-col items-center text-center">
      {isCampaign ? (
        <div>
          <h1 className="text-[clamp(3rem,10vw,9rem)] font-medium text-primary leading-[0.95] tracking-[-0.03em] uppercase">
            KABINETT
          </h1>
          <div className="mt-4 mb-1 mx-auto h-px w-12 bg-secondary/35" />
          <p className="text-[clamp(1.25rem,3vw,1.75rem)] text-secondary/70 leading-[1.2] tracking-[0.04em]">
            {headline || defaultHeadline}
          </p>
          {introText && (
            <p className="mt-4 max-w-[32rem] mx-auto text-[15px] text-secondary leading-[1.55]">
              {introText}
            </p>
          )}
        </div>
      ) : (
        <div>
          <h1 className="text-[clamp(3rem,10vw,9rem)] font-medium text-primary leading-[0.95] tracking-[-0.03em] uppercase">
            KABINETT
          </h1>
          <p className="mt-3 text-[15px] md:text-[18px] text-secondary">
            {headline || defaultHeadline}
          </p>
        </div>
      )}

      <div className="mt-8 w-full max-w-[52rem]">
      <Autocomplete
        query={query}
        onQueryChange={setQuery}
        onSelect={handleSelectSuggestion}
        buildRequestUrl={buildAutocompleteUrl}
        dropdownClassName="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-rule overflow-hidden"
      >
        {({ inputProps }) => (
          <form action="/search" method="get" onSubmit={handleSubmit}>
            <label htmlFor="hero-search" className="sr-only">
              {uiText(uiLocale, "Sök bland konstverk", "Search artworks")}
            </label>
            <div className="flex items-center border border-[#C8C3BC] rounded-card bg-white px-5 py-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
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
                onFocus={(e) => { inputProps.onFocus(); handleFocus(); }}
                id="hero-search"
                name="q"
                type="text" enterKeyHint="search" autoCorrect="off"
                placeholder={placeholder}
                className="flex-1 bg-transparent text-primary placeholder:text-secondary text-[16px] px-0 py-0 border-none outline-none [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
          </form>
        )}
      </Autocomplete>
      </div>

      <div className="mt-4 flex flex-wrap justify-center items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.08em] text-secondary">
          {uiText(uiLocale, "Prova", "Try")}
        </span>
        {suggestions.map((chip) => (
          <button
            key={`${campaignId}-${chip}`}
            type="button"
            onClick={() => goToSearch(chip, "visual")}
            className="cursor-pointer px-4 py-2 bg-paper text-[13px] text-secondary hover:text-primary transition-colors focus-ring rounded-card"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
