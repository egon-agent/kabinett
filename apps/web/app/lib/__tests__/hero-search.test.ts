import { describe, expect, it } from "vitest";
import { buildHeroAutocompleteUrl } from "../../components/HeroSearch";

describe("buildHeroAutocompleteUrl", () => {
  it("does not restrict homepage autocomplete to visual search only", () => {
    expect(buildHeroAutocompleteUrl("Anna Blom")).toBe("/api/autocomplete?q=Anna+Blom");
  });
});
