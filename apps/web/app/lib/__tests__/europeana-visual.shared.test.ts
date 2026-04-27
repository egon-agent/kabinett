import { describe, expect, it } from "vitest";
import {
  buildEuropeanaItemUrl,
  decodeVisualCursor,
  encodeVisualCursor,
  extractDatasetId,
  matchesLocalEuropeanaFilters,
  normalizeHexColor,
  normalizeRecordId,
  normalizeVisualFilters,
} from "../europeana-visual.shared";

describe("europeana visual shared helpers", () => {
  it("normalizes record ids to a canonical Europeana path", () => {
    expect(normalizeRecordId(" /966/europeana_fashion_500063023 ")).toBe("/966/europeana_fashion_500063023");
    expect(normalizeRecordId("966/europeana_fashion_500063023")).toBeNull();
  });

  it("extracts dataset ids from Europeana record ids", () => {
    expect(extractDatasetId("/966/europeana_fashion_500063023")).toBe("966");
    expect(extractDatasetId("/2048047/Clasate_ef61efc7bca74133b83eeb7f10d875ea")).toBe("2048047");
  });

  it("normalizes short and long hex colors", () => {
    expect(normalizeHexColor("#c62")).toBe("CC6622");
    expect(normalizeHexColor("1b4e8a")).toBe("1B4E8A");
    expect(normalizeHexColor("apple")).toBeNull();
  });

  it("round-trips local and remote cursors", () => {
    const local = encodeVisualCursor({ kind: "offset", offset: 24 });
    const remote = encodeVisualCursor({ kind: "europeana", cursor: "AoJ4..." });

    expect(decodeVisualCursor(local)).toEqual({ kind: "offset", offset: 24 });
    expect(decodeVisualCursor(remote)).toEqual({ kind: "europeana", cursor: "AoJ4..." });
  });

  it("normalizes filter payloads from mixed input shapes", () => {
    expect(normalizeVisualFilters({
      reusability: "OPEN",
      theme: " Art ",
      provider: " National Gallery of Denmark ",
      dataset: "966",
      hasThumbnail: "true",
      hasMedia: 1,
      hasLandingPage: "false",
    })).toEqual({
      reusability: "open",
      theme: "art",
      provider: "National Gallery of Denmark",
      dataset: "966",
      hasThumbnail: true,
      hasMedia: true,
      hasLandingPage: false,
    });
  });

  it("matches the local Europeana demo corpus assumptions", () => {
    const matchingFilters = normalizeVisualFilters({
      theme: "art",
      reusability: "open",
      provider: "Palais Galliera - Musée de la Mode de la Ville de Paris",
      dataset: "966",
      hasThumbnail: true,
      hasMedia: true,
    });
    const nonMatchingFilters = normalizeVisualFilters({
      theme: "fashion",
      hasMedia: false,
    });

    expect(matchesLocalEuropeanaFilters(
      "/966/europeana_fashion_500063023",
      "Palais Galliera - Musée de la Mode de la Ville de Paris",
      matchingFilters,
    )).toBe(true);
    expect(matchesLocalEuropeanaFilters(
      "/966/europeana_fashion_500063023",
      "Palais Galliera - Musée de la Mode de la Ville de Paris",
      nonMatchingFilters,
    )).toBe(false);
  });

  it("builds item URLs against europeana.eu", () => {
    expect(buildEuropeanaItemUrl("/966/europeana_fashion_500063023")).toBe(
      "https://www.europeana.eu/en/item/966/europeana_fashion_500063023",
    );
  });
});
