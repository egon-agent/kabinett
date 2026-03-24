import { beforeEach, describe, expect, it, vi } from "vitest";

const allMock = vi.fn();
const searchArtworksTextMock = vi.fn();
let enabledMuseumsMock = ["nm"];

vi.mock("../db.server", () => ({
  getDb: () => ({
    prepare: () => ({
      all: allMock,
    }),
  }),
}));

vi.mock("../museums.server", () => ({
  getEnabledMuseums: () => enabledMuseumsMock,
  sourceFilter: (prefix?: string) => ({
    sql: prefix
      ? `${prefix}.source IN (${enabledMuseumsMock.map(() => "?").join(",")})`
      : `source IN (${enabledMuseumsMock.map(() => "?").join(",")})`,
    params: enabledMuseumsMock,
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
    enabledMuseumsMock = ["nm"];
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

  it("round-robins museum rows for filter Alla", async () => {
    enabledMuseumsMock = ["nm", "shm"];

    const nmRows = [
      {
        id: 101,
        title_sv: "NM ett",
        title_en: null,
        artists: null,
        dating_text: "1901",
        iiif_url: "https://api.nationalmuseum.se/iiif/image/nm-101-abcdefghijklmnopqrstuv",
        dominant_color: "#111111",
        category: "Måleri",
        technique_material: "Olja",
        museum_name: "Nationalmuseum",
        focal_x: null,
        focal_y: null,
      },
      {
        id: 99,
        title_sv: "NM två",
        title_en: null,
        artists: null,
        dating_text: "1899",
        iiif_url: "https://api.nationalmuseum.se/iiif/image/nm-099-abcdefghijklmnopqrstuv",
        dominant_color: "#222222",
        category: "Måleri",
        technique_material: "Olja",
        museum_name: "Nationalmuseum",
        focal_x: null,
        focal_y: null,
      },
      {
        id: 97,
        title_sv: "NM tre",
        title_en: null,
        artists: null,
        dating_text: "1897",
        iiif_url: "https://api.nationalmuseum.se/iiif/image/nm-097-abcdefghijklmnopqrstuv",
        dominant_color: "#333333",
        category: "Måleri",
        technique_material: "Olja",
        museum_name: "Nationalmuseum",
        focal_x: null,
        focal_y: null,
      },
      {
        id: 95,
        title_sv: "NM fyra",
        title_en: null,
        artists: null,
        dating_text: "1895",
        iiif_url: "https://api.nationalmuseum.se/iiif/image/nm-095-abcdefghijklmnopqrstuv",
        dominant_color: "#444444",
        category: "Måleri",
        technique_material: "Olja",
        museum_name: "Nationalmuseum",
        focal_x: null,
        focal_y: null,
      },
    ];

    const shmRows = [
      {
        id: 201,
        title_sv: "SHM ett",
        title_en: null,
        artists: null,
        dating_text: "1801",
        iiif_url: "https://example.com/iiif/shm-201-abcdefghijklmnopqrstuv",
        dominant_color: "#555555",
        category: "Föremål",
        technique_material: "Trä",
        museum_name: "SHM",
        focal_x: null,
        focal_y: null,
      },
      {
        id: 199,
        title_sv: "SHM två",
        title_en: null,
        artists: null,
        dating_text: "1799",
        iiif_url: "https://example.com/iiif/shm-199-abcdefghijklmnopqrstuv",
        dominant_color: "#666666",
        category: "Föremål",
        technique_material: "Metall",
        museum_name: "SHM",
        focal_x: null,
        focal_y: null,
      },
      {
        id: 197,
        title_sv: "SHM tre",
        title_en: null,
        artists: null,
        dating_text: "1797",
        iiif_url: "https://example.com/iiif/shm-197-abcdefghijklmnopqrstuv",
        dominant_color: "#777777",
        category: "Föremål",
        technique_material: "Metall",
        museum_name: "SHM",
        focal_x: null,
        focal_y: null,
      },
      {
        id: 195,
        title_sv: "SHM fyra",
        title_en: null,
        artists: null,
        dating_text: "1795",
        iiif_url: "https://example.com/iiif/shm-195-abcdefghijklmnopqrstuv",
        dominant_color: "#888888",
        category: "Föremål",
        technique_material: "Metall",
        museum_name: "SHM",
        focal_x: null,
        focal_y: null,
      },
    ];

    allMock
      .mockReturnValueOnce(nmRows)
      .mockReturnValueOnce(shmRows);

    const firstPage = await fetchFeed({ limit: 2, filter: "Alla" });

    expect(firstPage.items.map((item) => item.id)).toEqual([101, 201]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBe(2);

    allMock.mockReset();
    allMock
      .mockReturnValueOnce(nmRows)
      .mockReturnValueOnce(shmRows);

    const secondPage = await fetchFeed({ cursor: firstPage.nextCursor, limit: 2, filter: "Alla" });

    expect(secondPage.items.map((item) => item.id)).toEqual([99, 199]);
  });
});
