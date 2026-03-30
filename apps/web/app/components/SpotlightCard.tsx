import { Link } from "react-router";
import {
  buildArtworkAltText,
  focalObjectPosition,
  type ArtworkDisplayItem,
} from "./artwork-meta";
import { uiText, useUiLocale } from "../lib/ui-language";

export type SpotlightCardData = {
  artistName: string;
  items: ArtworkDisplayItem[];
};

export default function SpotlightCard({ spotlight }: { spotlight: SpotlightCardData }) {
  const uiLocale = useUiLocale();

  return (
    <section className="py-10 md:py-12 border-t border-b border-rule px-4 md:px-6 lg:px-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-7">
      <div className="lg:max-w-[22rem]">
        <p className="text-[11px] uppercase tracking-[0.08em] text-secondary">
          {uiText(uiLocale, "Konstnär i fokus", "Artist spotlight")}
        </p>
        <h2 className="text-[24px] text-primary leading-[1.3] mt-2">
          {spotlight.artistName}
        </h2>
        <Link
          to={`/artist/${encodeURIComponent(spotlight.artistName)}`}
          prefetch="intent"
          className="inline-block mt-4 text-[13px] text-secondary hover:text-primary transition-colors no-underline focus-ring"
        >
          {uiText(uiLocale, "Utforska konstnären", "Explore artist")} →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {spotlight.items.map((item) => (
          <Link
            key={item.id}
            to={`/artwork/${item.id}`}
            prefetch="intent"
            className="shrink-0 w-[8.5rem] h-[8.5rem] overflow-hidden rounded-card block hover:opacity-85 transition-opacity duration-200 focus-ring"
            style={{ backgroundColor: item.dominant_color || "#E0DEDA" }}
          >
            <img
              src={item.imageUrl}
              alt={buildArtworkAltText(item)}
              loading="lazy"
              width={140}
              height={140}
              onError={(event) => {
                event.currentTarget.classList.add("is-broken");
              }}
              className="w-full h-full object-cover"
              style={{ objectPosition: focalObjectPosition(item.focal_x, item.focal_y) }}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
