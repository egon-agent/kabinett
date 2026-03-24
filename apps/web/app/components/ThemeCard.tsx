import { buildImageUrl } from "../lib/images";
import { uiText, useUiLocale } from "../lib/ui-language";
import {
  artworkArtist,
  buildArtworkAltText,
  focalObjectPosition,
  resolveArtworkTitle,
  type ArtworkDisplayItem,
} from "./artwork-meta";

export type ThemeCardSection = {
  title: string;
  subtitle: string;
  filter: string;
  color: string;
  searchType: "all" | "visual";
  items: ArtworkDisplayItem[];
  titleEn?: string;
  subtitleEn?: string;
  queryEn?: string;
};

export default function ThemeCard({ section, showMuseumBadge }: { section: ThemeCardSection; showMuseumBadge: boolean }) {
  const uiLocale = useUiLocale();
  const query = uiLocale === "en"
    ? section.queryEn || section.filter || section.title
    : section.filter || section.title;
  const title = uiText(uiLocale, section.title, section.titleEn || section.title);
  const subtitle = uiText(uiLocale, section.subtitle, section.subtitleEn || section.subtitle);
  const searchParams = new URLSearchParams({ q: query });
  if (section.searchType === "visual") searchParams.set("type", "visual");
  const searchHref = `/search?${searchParams.toString()}`;

  return (
    <div className="py-8 md:py-10 bg-paper">
      <div className="px-4 md:px-6 lg:px-10">
        <p className="text-[11px] uppercase tracking-[0.08em] text-secondary">
          {uiText(uiLocale, "Tema", "Theme")}
        </p>
        <h2 className="text-[18px] text-primary mt-1.5 leading-[1.3]">
          {title}
        </h2>
        <p className="text-[13px] text-secondary mt-0.5">
          {subtitle}
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 md:px-6 lg:px-10 mt-5 pb-1">
        {section.items.map((item) => (
          <a
            key={item.id}
            href={`/artwork/${item.id}`}
            className="shrink-0 w-[140px] md:w-[160px] block no-underline text-inherit hover:opacity-85 transition-opacity duration-200 focus-ring"
          >
            <div
              className="aspect-square overflow-hidden rounded-card"
              style={{ backgroundColor: item.dominant_color || "#E0DEDA" }}
            >
              <img
                src={buildImageUrl(item.iiif_url, 400)}
                alt={buildArtworkAltText(item)}
                loading="lazy"
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
            <div className="pt-2">
              <p className="text-[13px] text-primary leading-[1.3] line-clamp-2">
                {resolveArtworkTitle(item, uiText(uiLocale, "Utan titel", "Untitled"))}
              </p>
              <p className="text-[11px] text-secondary mt-0.5">
                {artworkArtist(item)}
              </p>
              {showMuseumBadge && item.museum_name && item.museum_name !== "Statens historiska museer" && (
                <p className="text-[11px] text-secondary mt-0.5">
                  {item.museum_name}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>

      <div className="px-4 md:px-6 lg:px-10 mt-4">
        <a
          href={searchHref}
          className="text-[13px] text-secondary hover:text-primary transition-colors no-underline focus-ring"
        >
          {uiText(uiLocale, "Visa fler", "View more")} →
        </a>
      </div>
    </div>
  );
}
