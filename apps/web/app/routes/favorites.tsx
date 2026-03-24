import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCampaignConfig } from "../lib/campaign.server";
import { useFavorites } from "../lib/favorites";
import { parseArtist } from "../lib/parsing";
import { formatUiNumber, resolveUiLocale, uiText, useUiLocale } from "../lib/ui-language";

export function loader() {
  const campaign = getCampaignConfig();
  return { uiLocale: resolveUiLocale(campaign.id) };
}

export function meta({ data }: { data?: { uiLocale?: "sv" | "en" } }) {
  const isEnglish = data?.uiLocale === "en";
  return [
    { title: isEnglish ? "Favorites — Kabinett" : "Favoriter — Kabinett" },
    { name: "description", content: isEnglish ? "Your saved artworks in Kabinett." : "Dina sparade konstverk i Kabinett." },
  ];
}

type FavoriteItem = {
  id: number;
  title: string;
  artists: string | null;
  dominant_color: string;
  imageUrl: string;
  focal_x?: number | null;
  focal_y?: number | null;
};

export default function Favorites() {
  const uiLocale = useUiLocale();
  const { ids, remove, toggle } = useFavorites();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [undoItem, setUndoItem] = useState<{ id: number; title: string } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const idsKey = useMemo(() => ids.join(","), [ids]);

  useEffect(() => {
    if (!idsKey) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/artworks?ids=${idsKey}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [idsKey]);

  const handleRemove = useCallback((id: number, title: string) => {
    remove(id);
    setUndoItem({ id, title });
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => setUndoItem(null), 5000);
  }, [remove]);

  const handleUndo = useCallback(() => {
    if (!undoItem) return;
    toggle(undoItem.id);
    setUndoItem(null);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  }, [undoItem, toggle]);

  return (
    <div className="min-h-screen pt-16 bg-white text-primary">
      <div className="px-4 md:px-6 lg:px-10 pt-8 pb-6">
        <h1 className="text-[32px] text-primary leading-[1.3]">{uiText(uiLocale, "Sparade", "Favorites")}</h1>
        <p className="mt-1 text-secondary text-[15px]">
          {ids.length > 0 ? uiText(uiLocale, `${ids.length} verk`, `${formatUiNumber(ids.length, uiLocale)} works`) : ""}
        </p>

        {loading && items.length === 0 && (
          <div aria-live="polite" className="py-8 text-secondary">{uiText(uiLocale, "Hämtar favoriter…", "Loading favorites…")}</div>
        )}

        {!loading && items.length === 0 && (
          <div aria-live="polite" className="py-12 text-center">
            <p className="text-secondary text-[0.95rem]">{uiText(uiLocale, "Inga sparade verk än.", "No favorites yet.")}</p>
            <p className="text-secondary text-sm mt-2">
              {uiText(uiLocale, "Tryck på hjärtat på ett konstverk för att spara det här.", "Tap the heart on an artwork to save it here.")}
            </p>
            <a href="/discover" className="inline-block mt-5 px-5 py-2.5 bg-paper text-secondary text-sm font-medium hover:bg-rule hover:text-primary transition-colors no-underline focus-ring">
              {uiText(uiLocale, "Utforska konst", "Explore art")}
            </a>
          </div>
        )}

        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 mt-6"
        >
          {items.map((item) => (
            <FavoriteCard key={item.id} item={item} onRemove={handleRemove} />
          ))}
        </div>
      </div>

      {/* Undo toast */}
      {undoItem && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 bg-white text-primary px-5 py-3 border border-rule">
          <span className="text-sm">{uiText(uiLocale, "Borttagen", "Removed")}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="text-sm font-semibold text-accent border-none bg-transparent cursor-pointer focus-ring"
          >
            {uiText(uiLocale, "Ångra", "Undo")}
          </button>
        </div>
      )}
    </div>
  );
}

function FavoriteCard({ item, onRemove }: { item: FavoriteItem; onRemove: (id: number, title: string) => void }) {
  const uiLocale = useUiLocale();
  return (
    <div className="relative group">
      <a
        href={`/artwork/${item.id}`}
        className="block no-underline text-inherit bg-paper overflow-hidden focus-ring"
      >
        <div
          className="aspect-[3/4]"
          style={{ backgroundColor: item.dominant_color || "#D4CDC3" }}
        >
          <img
            src={item.imageUrl}
            alt={`${item.title} — ${parseArtist(item.artists)}`}
            loading="lazy"
            width={400}
            height={533}
            onError={(event) => {
              event.currentTarget.classList.add("is-broken");
            }}
            className="w-full h-full object-cover"
            style={{ objectPosition: `${(item.focal_x ?? 0.5) * 100}% ${(item.focal_y ?? 0.5) * 100}%` }}
          />
        </div>
        <div className="p-3">
          <p className="text-sm font-medium text-primary leading-snug line-clamp-2 min-h-[2.25rem]">
            {item.title}
          </p>
          <p className="mt-1 text-xs text-secondary leading-snug line-clamp-1">
            {parseArtist(item.artists)}
          </p>
        </div>
      </a>
      <button
        type="button"
        aria-label={uiText(uiLocale, `Ta bort ${item.title}`, `Remove ${item.title}`)}
        onClick={() => onRemove(item.id, item.title)}
        className="absolute top-2 right-2 w-8 h-8 bg-white text-secondary hover:text-primary inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 cursor-pointer border-none focus-ring"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
