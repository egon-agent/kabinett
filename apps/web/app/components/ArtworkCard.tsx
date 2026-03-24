import React from "react";
import { buildImageUrl } from "../lib/images";
import { uiText, useUiLocale } from "../lib/ui-language";
import type { MatchType } from "../lib/search-types";
import {
  artworkArtist,
  buildArtworkAltText,
  focalObjectPosition,
  resolveArtworkTitle,
  type ArtworkDisplayItem,
} from "./artwork-meta";

type ArtworkCardProps = {
  item: ArtworkDisplayItem;
  showMuseumBadge: boolean;
  index?: number;
  yearLabel?: string | null;
  snippet?: string | null;
  matchType?: MatchType;
  variant?: "light" | "dark";
};

const ArtworkCard = React.memo(function ArtworkCard({
  item,
  showMuseumBadge,
  index = 0,
  yearLabel,
  snippet,
  variant = "light",
}: ArtworkCardProps) {
  const eager = index < 6;
  const uiLocale = useUiLocale();
  const titleColor = variant === "dark" ? "text-dark-primary" : "text-primary";
  const secondaryColor = variant === "dark" ? "text-dark-secondary" : "text-secondary";

  return (
    <a
      href={`/artwork/${item.id}`}
      className="block no-underline text-inherit hover:opacity-85 transition-opacity duration-200 focus-ring"
    >
      <div
        className="aspect-square overflow-hidden rounded-card"
        style={{ backgroundColor: item.dominant_color || "#E0DEDA" }}
      >
        <img
          src={item.imageUrl || (item.iiif_url ? buildImageUrl(item.iiif_url, 400) : "")}
          alt={buildArtworkAltText(item)}
          loading={eager ? "eager" : "lazy"}
          decoding="auto"
          fetchPriority={eager ? "high" : undefined}
          width={400}
          height={400}
          onError={(event) => {
            event.currentTarget.classList.add("is-broken");
          }}
          className="w-full h-full object-cover"
          style={{
            objectPosition: focalObjectPosition(item.focal_x, item.focal_y),
          }}
        />
      </div>
      <div className="p-3">
        <p className={`text-[15px] ${titleColor} leading-[1.3] line-clamp-2`}>
          {resolveArtworkTitle(item, uiText(uiLocale, "Utan titel", "Untitled"))}
        </p>
        <p className={`text-[13px] ${secondaryColor} mt-0.5`}>{artworkArtist(item)}</p>
        {showMuseumBadge && item.museum_name && (
          <p className={`text-[11px] ${secondaryColor} mt-0.5`}>{item.museum_name}</p>
        )}
        {yearLabel && <p className={`text-[11px] ${secondaryColor} mt-0.5`}>{yearLabel}</p>}
        {snippet && (
          <p className={`text-[11px] ${secondaryColor} mt-1 line-clamp-2`}>{snippet}</p>
        )}
      </div>
    </a>
  );
});

export default ArtworkCard;
