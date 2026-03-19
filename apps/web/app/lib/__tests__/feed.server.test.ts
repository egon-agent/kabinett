import { beforeEach, describe, expect, it, vi } from "vitest";

const allMock = vi.fn();
const searchArtworksTextMock = vi.fn();

vi.mock("../db.server", () => ({
  getDb: () => ({
    prepare: () => ({
      all: allMock,
    }),
  }),
}));

vi.mock("../museums.server", () => ({
  getEnabledMuseums: () => ["nm"],
  sourceFilter: (prefix?: string) => ({
    sql: prefix ? `${prefix}.source IN (?)` : "source IN (?)",
    params: ["nm"],
  }),
}));

vi.mock("../text-search.server", () => ({
  searchArtworksText: (...args: unknown[]) => searchArtworksTextMock(...args),
}));

import { fetchFeed } from "../feed.server";

describe("fetchFeed", () => {
  beforeEach(() => {
    allMock.mockReset();
    searchArtworksTextMock.mockReset();
  });

  it("returns items with expected shape for filter Alla", async () => {
    allMock.mockReturnValue([
      {
        id: 99,
        title_sv: "Ett verk",
        title_en: null,
        artists: "[{\"name\":\"Konstnär\"}]",
        dating_text: "1888",
        iiif_url: "https://api.nationalmuseum.se/iiif/image/abcde1234567890",
        dominant_color: "#111111",
        category: "Måleri",
        technique_material: "Olja på duk",
        museum_name: "Nationalmuseum",
      },
    ]);

    const result = await fetchFeed({ limit: 10, filter: "Alla" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 99,
      title_sv: "Ett verk",
      dating_text: "1888",
      iiif_url: "https://api.nationalmuseum.se/iiif/image/abcde1234567890",
      dominant_color: "#111111",
      category: "Måleri",
      technique_material: "Olja på duk",
      museum_name: "Nationalmuseum",
    });
    expect(result.items[0].imageUrl).toContain("img.norrava.com");
    expect(decodeURIComponent(result.items[0].imageUrl)).toContain("/full/400,/0/default.jpg");
    expect(result.mode).toBe("cursor");
  });

  it("falls back to text search for unsupported theme filters", async () => {
    searchArtworksTextMock.mockReturnValue([
      {
        id: 7,
        title_sv: "Samiskt bälte",
        title_en: null,
        artists: null,
        dating_text: "1900-tal",
        iiif_url: "https://example.com/iiif/samiskt-balte-12345678901234567890",
        dominant_color: "#222222",
        category: "Dräkt",
        technique_material: "Textil",
        museum_name: "Nordiska museet",
        focal_x: null,
        focal_y: null,
      },
    ]);

    const result = await fetchFeed({ limit: 8, filter: "samisk" });

    expect(searchArtworksTextMock).toHaveBeenCalledWith(expect.objectContaining({
      query: "samisk",
      limit: 8,
      offset: 0,
      scope: "broad",
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 7,
      title_sv: "Samiskt bälte",
      museum_name: "Nordiska museet",
    });
    expect(result.mode).toBe("offset");
  });
});
