type FeaturedItem = {
  id: number;
  title: string;
  artist: string;
  datingText: string | null;
  imageUrl: string;
  color: string;
  focal_x: number | null;
  focal_y: number | null;
};

export type { FeaturedItem };

export default function FeaturedGrid({ items }: { items: FeaturedItem[] }) {
  if (items.length === 0) {
    return <p className="text-secondary mt-4">Inga verk att visa just nu.</p>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-3.5 mt-5">
      {items.map((item) => (
        <a
          key={item.id}
          href={`/artwork/${item.id}`}
          className="art-card block overflow-hidden bg-white no-underline contain-[layout_paint] group focus-ring"
        >
          <div className="aspect-square overflow-hidden rounded-card" style={{ backgroundColor: item.color }}>
            <img
              src={item.imageUrl}
              alt={`${item.title} — ${item.artist}`}
              loading="lazy"
              width={400}
              height={400}
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
            <p className="text-xs text-secondary mt-1 leading-snug line-clamp-1">
              {item.artist}
              {item.datingText ? ` · ${item.datingText}` : ""}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
