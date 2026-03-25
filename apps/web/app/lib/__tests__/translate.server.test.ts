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

  it("deduplicates concurrent translations for the same query", async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<{
      ok: boolean;
      json: () => Promise<unknown>;
    }>((resolve) => {
      resolveFetch = resolve;
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = translateToEnglish("röd hatt dedupe");
    const second = translateToEnglish("röd hatt dedupe");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch({
      ok: true,
      json: async () => [[["red hat"]]],
    });

    await expect(first).resolves.toBe("red hat");
    await expect(second).resolves.toBe("red hat");
  });

  it("short-circuits immediate retries after a translation timeout", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(translateToEnglish("röd timeout cache")).resolves.toBe("röd timeout cache");
    await expect(translateToEnglish("röd timeout cache")).resolves.toBe("röd timeout cache");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats ascii Swedish queries as translatable when they contain Swedish hints", () => {
    expect(shouldTranslateToEnglish("rod klanning")).toBe(true);
  });
});
