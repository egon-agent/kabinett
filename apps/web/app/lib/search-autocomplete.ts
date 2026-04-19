import type { AutocompleteSuggestion } from "../components/Autocomplete";

export type SearchAutocompleteType = "all" | "artwork" | "artist" | "visual";

type SearchAutocompleteOptions = {
  museum?: string;
  searchType: SearchAutocompleteType;
};

export function buildSearchUrl(value: string, options: SearchAutocompleteOptions): string {
  const trimmed = value.trim();
  const params = new URLSearchParams();

  if (trimmed) params.set("q", trimmed);
  if (options.museum) params.set("museum", options.museum);
  if (options.searchType !== "all") params.set("type", options.searchType);

  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function buildSearchAutocompleteUrl(value: string, options: SearchAutocompleteOptions): string {
  const params = new URLSearchParams({ q: value });

  if (options.museum) params.set("museum", options.museum);
  if (options.searchType !== "all" && options.searchType !== "visual") {
    params.set("type", options.searchType);
  }

  return `/api/autocomplete?${params.toString()}`;
}

export function resolveSearchAutocompletePath(
  suggestion: AutocompleteSuggestion,
  options: SearchAutocompleteOptions
): string {
  if (suggestion.type === "artist") {
    return `/artist/${encodeURIComponent(suggestion.value)}`;
  }

  const value = suggestion.type === "artwork" ? suggestion.title : suggestion.value;
  return buildSearchUrl(value, options);
}
