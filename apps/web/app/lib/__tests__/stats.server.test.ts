import { describe, expect, it, vi } from "vitest";

vi.mock("../museums.server", () => ({
  getCollectionOptions: () => Array.from({ length: 8 }, (_, index) => ({
    id: `museum-${index}`,
    name: `Museum ${index}`,
    count: 100,
  })),
  sourceFilter: (prefix?: string) => ({
    sql: prefix ? `${prefix}.source IN (?)` : "source IN (?)",
    params: ["nm"],
  }),
  getCollectionOptions: () => Array.from({ length: 8 }, (_, index) => ({
    id: `collection:${index + 1}`,
    name: `Collection ${index + 1}`,
    count: 100,
  })),
}));

import { getSiteStats } from "../stats.server";

describe("getSiteStats", () => {
  it("returns expected stats shape", () => {
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("FROM sqlite_master")) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() => undefined),
          };
        }
        return {
          all: vi.fn(() => []),
          get: vi.fn(() => {
            if (sql.includes("MIN(year_start)")) return { c: 1720 };
            if (sql.includes("MAX(COALESCE(year_end, year_start))")) return { c: 1910 };
            if (sql.includes("COUNT(*) as c FROM artworks WHERE category LIKE")) return { c: 42 };
            if (sql.includes("COUNT(*) as c FROM artworks WHERE")) return { c: 1234 };
            return { c: 0 };
          }),
        };
      }),
    } as any;

    const result = getSiteStats(db);

    expect(result).toEqual({
      totalWorks: 1234,
      museums: 8,
      paintings: 42,
      minYear: 1720,
      maxYear: 1910,
      yearsSpan: new Date().getFullYear() - 1720,
    });
  });
});
