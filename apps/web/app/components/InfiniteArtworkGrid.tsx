import { useState, useRef, useEffect, useCallback } from "react";
import GridCard, { type GridCardItem } from "./GridCard";
import { uiText, useUiLocale } from "../lib/ui-language";

type Props = {
  fetchUrl: string;
  heading?: string;
};

export default function InfiniteArtworkGrid({ fetchUrl, heading = "Alla verk" }: Props) {
  const uiLocale = useUiLocale();
  const [works, setWorks] = useState<GridCardItem[]>([]);
  const [canLoadMore, setCanLoadMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (loading || !canLoadMore) return;
    setLoading(true);
    setLoadError(false);
    try {
      const separator = fetchUrl.includes("?") ? "&" : "?";
      const res = await fetch(`${fetchUrl}${separator}offset=${offsetRef.current}`);
      if (!res.ok) throw new Error("Could not load artworks");
      const data = (await res.json()) as { works: GridCardItem[]; hasMore: boolean };
      if (data.works.length === 0) {
        setCanLoadMore(false);
      } else {
        offsetRef.current += data.works.length;
        setWorks((prev) => [...prev, ...data.works]);
        setCanLoadMore(data.hasMore);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [fetchUrl, canLoadMore, loading]);

  useEffect(() => {
    setWorks([]);
    setCanLoadMore(true);
    setInitialLoad(true);
    offsetRef.current = 0;
  }, [fetchUrl]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  if (works.length === 0 && !canLoadMore && !initialLoad) return null;

  return (
    <section className="pt-10 pb-16">
      <h2 className="text-[1.35rem] text-primary mb-5">{uiText(uiLocale, heading, heading === "Alla verk" ? "All works" : heading)}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {works.map((w) => (
          <GridCard key={w.id} item={w} />
        ))}
      </div>
      {loadError && (
        <div className="text-center py-6" aria-live="polite">
          <p className="text-sm text-secondary mb-3">{uiText(uiLocale, "Kunde inte ladda fler verk.", "Could not load more artworks.")}</p>
          <button
            type="button"
            onClick={() => { setLoadError(false); loadMore(); }}
            className="px-4 py-2 rounded-full border border-rule/30 text-sm text-primary font-medium hover:bg-paper transition-colors focus-ring"
          >
            {uiText(uiLocale, "Försök igen", "Try again")}
          </button>
        </div>
      )}
      {canLoadMore && !loadError && <div ref={sentinelRef} className="h-4" />}
      {loading && (
        <p className="text-center text-sm text-secondary py-4">
          {uiText(uiLocale, "Laddar fler verk…", "Loading more artworks…")}
        </p>
      )}
    </section>
  );
}
