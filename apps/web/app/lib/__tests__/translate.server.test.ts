import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldTranslateToEnglish, translateToEnglish } from "../translate.server";

describe("translate.server", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("skips translation for likely English search queries", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    expect(shouldTranslateToEnglish("1950s dress")).toBe(false);
    await expect(translateToEnglish("1950s dress")).resolves.toBe("1950s dress");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats ambiguous ascii queries as English for demo performance", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    expect(shouldTranslateToEnglish("water")).toBe(false);
    await expect(translateToEnglish("water")).resolves.toBe("water");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps translating Swedish queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[["red dress"]]],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(shouldTranslateToEnglish("röd klänning")).toBe(true);
    await expect(translateToEnglish("röd klänning")).resolves.toBe("red dress");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats ascii Swedish queries as translatable when they contain Swedish hints", () => {
    expect(shouldTranslateToEnglish("rod klanning")).toBe(true);
  });
});
