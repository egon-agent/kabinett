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
    return <p className="text-warm-gray mt-4">Inga verk att visa just nu.</p>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
      {items.map((item) => (
        <a
          key={item.id}
          href={`/artwork/${item.id}`}
          className="art-card block rounded-card overflow-hidden bg-white shadow-card no-underline contain-[layout_paint] group focus-ring"
        >
          <div className="relative aspect-[3/4]" style={{ backgroundColor: item.color }}>
            <img
              src={item.imageUrl}
              alt={`${item.title} — ${item.artist}`}
              loading="lazy"
              width={400}
              height={533}
              onError={(event) => {
                event.currentTarget.classList.add("is-broken");
              }}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              style={{ objectPosition: `${(item.focal_x ?? 0.5) * 100}% ${(item.focal_y ?? 0.5) * 100}%` }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,9,8,0.55)_0%,rgba(10,9,8,0.05)_60%,transparent_100%)]" />
          </div>
          <div className="p-3">
            <p className="text-sm font-medium text-charcoal leading-snug line-clamp-2 min-h-[2.25rem]">
              {item.title}
            </p>
            <p className="text-xs text-warm-gray mt-1 leading-snug line-clamp-1">
              {item.artist}
              {item.datingText ? ` · ${item.datingText}` : ""}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
