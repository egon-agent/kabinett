import { useState, useRef, useEffect, useCallback } from "react";
import GridCard, { type GridCardItem } from "./GridCard";

type Props = {
  fetchUrl: string;
  heading?: string;
};

export default function InfiniteArtworkGrid({ fetchUrl, heading = "Alla verk" }: Props) {
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
      if (!res.ok) throw new Error("Kunde inte ladda verk");
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
      <h2 className="font-serif text-[1.4rem] text-charcoal mb-4">{heading}</h2>
      <div className="columns-2 gap-3 md:columns-3 lg:columns-4 lg:gap-4">
        {works.map((w) => (
          <GridCard key={w.id} item={w} />
        ))}
      </div>
      {loadError && (
        <div className="text-center py-6" aria-live="polite">
          <p className="text-sm text-warm-gray mb-3">Kunde inte ladda fler verk.</p>
          <button
            type="button"
            onClick={() => { setLoadError(false); loadMore(); }}
            className="px-4 py-2 rounded-full border border-stone/30 text-sm text-charcoal font-medium hover:bg-linen transition-colors focus-ring"
          >
            Försök igen
          </button>
        </div>
      )}
      {canLoadMore && !loadError && <div ref={sentinelRef} className="h-4" />}
      {loading && (
        <p className="text-center text-sm text-warm-gray py-4">
          Laddar fler verk…
        </p>
      )}
    </section>
  );
}
