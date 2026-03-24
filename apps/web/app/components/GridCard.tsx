type GridCardItem = {
  id: number | string;
  title: string;
  artist?: string;
  year?: string;
  imageUrl: string;
  color: string;
  focal_x?: number | null;
  focal_y?: number | null;
};

type GridCardProps = {
  item: GridCardItem;
  variant?: "light" | "dark";
};

export type { GridCardItem };

export default function GridCard({ item, variant = "light" }: GridCardProps) {
  const titleColor = variant === "dark" ? "text-dark-primary" : "text-primary";
  const secondaryColor = variant === "dark" ? "text-dark-secondary" : "text-secondary";
  const focalPos = `${(item.focal_x ?? 0.5) * 100}% ${(item.focal_y ?? 0.5) * 100}%`;

  return (
    <a
      href={`/artwork/${item.id}`}
      className="block no-underline hover:opacity-85 transition-opacity duration-200 focus-ring"
    >
      <div
        className="aspect-square overflow-hidden rounded-card"
        style={{ backgroundColor: item.color }}
      >
        <img
          src={item.imageUrl}
          alt={item.artist ? `${item.title} — ${item.artist}` : item.title}
          width={400}
          height={533}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.classList.add("is-broken");
          }}
          className="w-full h-full object-cover"
          style={{ objectPosition: focalPos }}
        />
      </div>
      <div className="p-3">
        <p className={`text-[15px] ${titleColor} leading-[1.3] line-clamp-2 min-h-[2.25rem]`}>
          {item.title}
        </p>
        {(item.artist || item.year) && (
          <p className={`text-[13px] ${secondaryColor} mt-0.5 leading-[1.3] line-clamp-1`}>
            {item.artist}
            {item.artist && item.year ? " · " : ""}
            {item.year}
          </p>
        )}
      </div>
    </a>
  );
}
