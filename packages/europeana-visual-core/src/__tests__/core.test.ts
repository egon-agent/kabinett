import { describe, expect, it } from "vitest";
import {
  createEuropeanaVisualLayer,
  type ColorSearchAdapter,
  type HydrationAdapter,
  type VectorIndex,
} from "../index";

const vectorIndex: VectorIndex = {
  async searchByText() {
    return [
      { artworkId: 1, recordId: "/100/apple", provider: "Provider A", score: 0.91 },
      { artworkId: 2, recordId: "/100/apple", provider: "Provider A", score: 0.72 },
      { artworkId: 3, recordId: "/200/pear", provider: "Provider B", score: 0.68 },
    ];
  },
  async searchBySeedArtworkIds() {
    return [
      { artworkId: 11, recordId: "/300/seed-fallback", provider: "Provider C", score: 0.66 },
    ];
  },
  getArtworkIdsForRecordId(recordId) {
    return recordId === "/100/apple" ? [1] : [];
  },
  getNeighborCandidates() {
    return [
      { artworkId: 4, recordId: "/400/neighbor", provider: "Provider D", score: 0.81 },
      { artworkId: 1, recordId: "/100/apple", provider: "Provider A", score: 0.78 },
    ];
  },
};

const colorSearch: ColorSearchAdapter = {
  async searchColor() {
    return {
      items: [
        { recordId: "/500/red", score: 1 },
        { recordId: "/501/red", score: 0.9 },
      ],
      nextCursor: null,
      indexSize: 2,
      engine: "local-dominant-color",
    };
  },
};

const hydration: HydrationAdapter = {
  async hydrateRecords(recordIds) {
    return recordIds.map((recordId) => ({
      recordId,
      title: "Hydrated title",
      provider: "Europeana",
      description: null,
      rights: null,
      thumbnailUrl: null,
      europeanaUrl: `https://www.europeana.eu/en/item${recordId}`,
      year: null,
      type: "IMAGE",
    }));
  },
};

describe("createEuropeanaVisualLayer", () => {
  it("returns product search responses as recordId and score only", async () => {
    const layer = createEuropeanaVisualLayer({ vectorIndex, colorSearch, hydration });
    const response = await layer.search({ query: "apple", limit: 2 });

    expect(response.items).toEqual([
      { recordId: "/100/apple", score: 0.91 },
      { recordId: "/200/pear", score: 0.68 },
    ]);
    expect(response.nextCursor).toBeNull();
    expect(response.meta.mode).toBe("visual-search");
  });

  it("excludes the seed record from similar responses", async () => {
    const layer = createEuropeanaVisualLayer({ vectorIndex, colorSearch, hydration });
    const response = await layer.similar({ recordId: "/100/apple", limit: 1 });

    expect(response.items).toEqual([
      { recordId: "/400/neighbor", score: 0.81 },
    ]);
    expect(response.meta.mode).toBe("visual-similar");
  });

  it("returns locally ranked color results with offset cursors", async () => {
    const layer = createEuropeanaVisualLayer({ vectorIndex, colorSearch, hydration });
    const response = await layer.color({ hex: "#c62", limit: 1 });

    expect(response.items).toEqual([{ recordId: "/500/red", score: 1 }]);
    expect(response.nextCursor).toBeTruthy();
    expect(response.meta.engine).toBe("local-dominant-color");
    expect(response.meta.indexSize).toBe(2);
  });

  it("keeps hydration in the demo-only contract", async () => {
    const layer = createEuropeanaVisualLayer({ vectorIndex, colorSearch, hydration });
    const response = await layer.hydrateDemoRecords({ recordIds: ["/100/apple"], limit: 1 });

    expect(response.items[0].recordId).toBe("/100/apple");
    expect(response.meta.demoOnly).toBe(true);
  });
});
