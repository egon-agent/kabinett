import { describe, expect, it } from "vitest";
import {
  buildSearchAutocompleteUrl,
  buildSearchUrl,
  resolveSearchAutocompletePath,
} from "../search-autocomplete";

describe("search autocomplete helpers", () => {
  it("does not restrict autocomplete to visual search suggestions", () => {
    expect(buildSearchAutocompleteUrl("Anna Blom", { searchType: "visual" })).toBe(
      "/api/autocomplete?q=Anna+Blom"
    );
  });

  it("preserves explicit search types that are not visual", () => {
    expect(buildSearchAutocompleteUrl("Anna Blom", { searchType: "artist", museum: "shm" })).toBe(
      "/api/autocomplete?q=Anna+Blom&museum=shm&type=artist"
    );
  });

  it("navigates artist suggestions directly to the artist page", () => {
    expect(
      resolveSearchAutocompletePath(
        { type: "artist", value: "Anna Blom", count: 4 },
        { searchType: "visual" }
      )
    ).toBe("/artist/Anna%20Blom");
  });

  it("keeps visual search state for non-artist suggestions", () => {
    expect(
      resolveSearchAutocompletePath(
        { type: "clip", value: "blommor" },
        { searchType: "visual", museum: "shm" }
      )
    ).toBe("/search?q=blommor&museum=shm&type=visual");
  });

  it("builds the default search path for form submissions", () => {
    expect(buildSearchUrl("  Anna Blom  ", { searchType: "all" })).toBe("/search?q=Anna+Blom");
  });
});
